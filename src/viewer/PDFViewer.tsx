import { useEffect, useRef, useState, useCallback } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { pdfjsLib } from '../lib/pdf'
import { supabase } from '../lib/supabase'
import { useUser } from '../lib/UserContext'
import { recordGuestDownload, recordGuestEgress } from '../lib/queries'
import { readPDFCache, writePDFCache } from '../lib/pdfCache'
import type { Sheet } from '../types'

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

const zoomUp = (z: number) => ZOOM_STEPS.find(s => s > z) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
const zoomDown = (z: number) => [...ZOOM_STEPS].reverse().find(s => s < z) ?? ZOOM_STEPS[0]

interface Props {
  sheet: Sheet
  onClose: () => void
}

export default function PDFViewer({ sheet, onClose }: Props) {
  const { isOwner } = useUser()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const renderingRef = useRef(false)
  const pendingRef = useRef<{ page: number; zoom: number } | null>(null)
  const pdfBytesRef = useRef<ArrayBuffer | null>(null)

  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [docReady, setDocReady] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [downloading, setDownloading] = useState(false)
  const [fromCache, setFromCache] = useState(false)

  // Load document: Cache API first, Supabase Storage on miss
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setDocReady(false)
    setPage(1)
    setFromCache(false)
    pdfBytesRef.current = null

    async function load() {
      // Try persistent cache first
      let buffer = await readPDFCache(sheet.file_path)

      if (!buffer) {
        // Cache miss: fetch from Supabase and cache for next time
        const { data } = await supabase.storage.from('sheets').createSignedUrl(sheet.file_path, 3600)
        if (cancelled || !data?.signedUrl) return
        const res = await fetch(data.signedUrl)
        buffer = await res.arrayBuffer()
        writePDFCache(sheet.file_path, buffer)
        if (!isOwner) recordGuestEgress(buffer.byteLength)
      } else {
        setFromCache(true)
      }

      if (cancelled) return
      pdfBytesRef.current = buffer

      // Pass a copy so PDF.js can transfer the buffer to its worker without neutering our stored copy
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise
      if (cancelled) {
        doc.destroy()
        return
      }
      docRef.current = doc
      setTotalPages(doc.numPages)
      setDocReady(true)
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
      docRef.current?.destroy()
      docRef.current = null
    }
  }, [sheet.file_path, isOwner])

  // Render at correct resolution
  const renderPage = useCallback(async (pageNum: number, zoomLevel: number) => {
    const doc = docRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas) return

    if (renderingRef.current) {
      pendingRef.current = { page: pageNum, zoom: zoomLevel }
      return
    }

    renderingRef.current = true
    try {
      const pdfPage = await doc.getPage(pageNum)
      const baseViewport = pdfPage.getViewport({ scale: 1 })
      const dpr = window.devicePixelRatio || 1

      const mobile = window.innerWidth < 640
      const fitScale = Math.min(
        (window.innerWidth - (mobile ? 24 : 96)) / baseViewport.width,
        (window.innerHeight - (mobile ? 104 : 120)) / baseViewport.height,
      )

      // Render at full device resolution times the zoom level
      const renderScale = fitScale * zoomLevel * dpr
      const viewport = pdfPage.getViewport({ scale: renderScale })

      // Physical pixels (sharp on retina)
      canvas.width = viewport.width
      canvas.height = viewport.height

      // CSS pixels (how large it appears)
      canvas.style.width = `${fitScale * zoomLevel * baseViewport.width}px`
      canvas.style.height = `${fitScale * zoomLevel * baseViewport.height}px`

      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise
    } catch {
      // render cancelled: ignore
    } finally {
      renderingRef.current = false
      if (pendingRef.current) {
        const next = pendingRef.current
        pendingRef.current = null
        renderPage(next.page, next.zoom)
      }
    }
  }, [])

  useEffect(() => {
    if (docReady) renderPage(page, zoom)
  }, [docReady, page, zoom, renderPage])

  useEffect(() => {
    const onResize = () => { if (docReady) renderPage(page, zoom) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [docReady, page, zoom, renderPage])

  // Keyboard navigation + zoom
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setPage(p => Math.max(1, p - 1))
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault()
        setPage(p => Math.min(totalPages, p + 1))
      } else if (e.key === 'Escape') {
        onClose()
      } else if ((e.key === '+' || e.key === '=') && !e.ctrlKey && !e.metaKey) {
        setZoom(zoomUp)
      } else if (e.key === '-' && !e.ctrlKey && !e.metaKey) {
        setZoom(zoomDown)
      } else if (e.key === '0') {
        setZoom(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [totalPages, onClose])

  // Ctrl/Cmd + scroll to zoom
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom(e.deltaY > 0 ? zoomDown : zoomUp)
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  const prev = () => setPage(p => Math.max(1, p - 1))
  const next = () => setPage(p => Math.min(totalPages, p + 1))

  const canZoomIn = zoom < ZOOM_STEPS[ZOOM_STEPS.length - 1]
  const canZoomOut = zoom > ZOOM_STEPS[0]

  async function handleDownload() {
    setDownloading(true)
    try {
      // Use in-memory bytes if available, fall back to cache, then re-fetch
      let buffer = pdfBytesRef.current ?? await readPDFCache(sheet.file_path)
      if (!buffer) {
        const { data } = await supabase.storage.from('sheets').createSignedUrl(sheet.file_path, 60)
        if (!data?.signedUrl) return
        const res = await fetch(data.signedUrl)
        buffer = await res.arrayBuffer()
      }
      const blob = new Blob([buffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${sheet.title}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      if (!isOwner) recordGuestDownload(buffer.byteLength)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#080808] flex flex-col">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-6 h-14 border-b border-zinc-900/80">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-zinc-200 truncate">{sheet.title}</p>
            {fromCache && (
              <span className="shrink-0 text-[10px] text-zinc-600 border border-zinc-800 px-1.5 py-0.5 rounded-full">
                cached
              </span>
            )}
          </div>
          {sheet.composer && <p className="text-xs text-zinc-600 truncate">{sheet.composer}</p>}
        </div>
        <div className="flex items-center gap-4 shrink-0 ml-4">
          {totalPages > 0 && (
            <span className="text-xs text-zinc-600 tabular-nums">{page} / {totalPages}</span>
          )}
          <button
            onClick={handleDownload}
            disabled={loading || downloading}
            title="Download PDF"
            className="text-zinc-600 hover:text-zinc-200 disabled:opacity-30 transition-colors cursor-pointer"
          >
            {downloading ? (
              <div className="w-4 h-4 border border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m-4-4l4 4 4-4" />
              </svg>
            )}
          </button>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-200 transition-colors cursor-pointer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Canvas / scroll area */}
      <div className="flex-1 overflow-auto">
        <div className="min-h-full flex items-center justify-center p-8">
          {loading ? (
            <div
              className="animate-pulse bg-zinc-900 rounded-lg flex flex-col p-8 gap-5 shadow-2xl shadow-black/60 shrink-0"
              style={{
                width: 'min(calc(100vw - 3rem), calc((100vh - 9rem) * 0.707))',
                aspectRatio: '210 / 297',
              }}
            >
              {/* Title block */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="h-3.5 bg-zinc-800 rounded-full w-2/5" />
                <div className="h-2.5 bg-zinc-800/60 rounded-full w-1/5" />
              </div>
              {/* Music staves: vertical bar + 5 horizontal lines each */}
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="shrink-0 flex items-stretch gap-2">
                  <div className="w-0.5 bg-zinc-800 rounded-full" />
                  <div className="flex-1 flex flex-col gap-2 py-1">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <div key={j} className="h-px bg-zinc-800" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="shadow-2xl shadow-black/80 block"
            />
          )}
        </div>
      </div>

      {/* Bottom bar */}
      {!loading && (
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 h-14 sm:h-12 border-t border-zinc-900/80">
          {/* Page navigation */}
          <div className="flex items-center gap-4">
            {totalPages > 1 && (
              <>
                <button
                  onClick={prev}
                  disabled={page <= 1}
                  className="text-zinc-500 hover:text-zinc-200 disabled:opacity-20 transition-colors cursor-pointer p-2 sm:p-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-xs text-zinc-600 tabular-nums">{page} / {totalPages}</span>
                <button
                  onClick={next}
                  disabled={page >= totalPages}
                  className="text-zinc-500 hover:text-zinc-200 disabled:opacity-20 transition-colors cursor-pointer p-2 sm:p-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom(zoomDown)}
              disabled={!canZoomOut}
              className="text-zinc-500 hover:text-zinc-200 disabled:opacity-20 transition-colors cursor-pointer p-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
              </svg>
            </button>
            <button
              onClick={() => setZoom(1)}
              className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer tabular-nums w-12 text-center"
            >
              {zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`}
            </button>
            <button
              onClick={() => setZoom(zoomUp)}
              disabled={!canZoomIn}
              className="text-zinc-500 hover:text-zinc-200 disabled:opacity-20 transition-colors cursor-pointer p-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
