import { useState, useEffect, useRef } from 'react'
import { pdfjsLib } from '../lib/pdf'
import { supabase } from '../lib/supabase'
import { useUser } from '../lib/UserContext'
import { readPDFCache, writePDFCache } from '../lib/pdfCache'
import { recordGuestEgress } from '../lib/queries'

const THUMBNAIL_CACHE_NAME = 'ownsheets-thumbnails-v1'

async function readThumbnailCache(filePath: string): Promise<string | null> {
  try {
    const cache = await caches.open(THUMBNAIL_CACHE_NAME)
    const response = await cache.match(filePath)
    return response ? response.text() : null
  } catch {
    return null
  }
}

async function writeThumbnailCache(filePath: string, dataUrl: string): Promise<void> {
  try {
    const cache = await caches.open(THUMBNAIL_CACHE_NAME)
    await cache.put(filePath, new Response(dataUrl, { headers: { 'Content-Type': 'text/plain' } }))
  } catch { /* storage quota or private browsing */ }
}

async function renderThumbnail(filePath: string, isOwner: boolean): Promise<string | null> {
  // Return the cached thumbnail immediately if available.
  const cached = await readThumbnailCache(filePath)
  if (cached) return cached

  // Reuse the PDF cache if the viewer already fetched this file, avoiding extra egress.
  let buffer = await readPDFCache(filePath)

  if (!buffer) {
    // Full cache miss: fetch from Supabase Storage.
    const { data } = await supabase.storage.from('sheets').createSignedUrl(filePath, 3600)
    if (!data?.signedUrl) return null
    const res = await fetch(data.signedUrl)
    buffer = await res.arrayBuffer()
    // Pre-warm the PDF cache so the viewer won't need to re-fetch this file.
    writePDFCache(filePath, buffer)
    if (!isOwner) recordGuestEgress(buffer.byteLength)
  }

  // Pass a copy so PDF.js can transfer the buffer without neutering our cached copy.
  const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise
  const page = await pdfDoc.getPage(1)
  const baseViewport = page.getViewport({ scale: 1 })
  const scale = 320 / baseViewport.width
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise

  const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
  pdfDoc.destroy()

  await writeThumbnailCache(filePath, dataUrl)
  return dataUrl
}

export function useThumbnail(filePath: string) {
  const { isOwner } = useUser()
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const fetched = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || fetched.current) return
      fetched.current = true
      setLoading(true)
      renderThumbnail(filePath, isOwner)
        .then(url => {
          setDataUrl(url)
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }, { threshold: 0.05 })

    observer.observe(el)
    return () => observer.disconnect()
  }, [filePath, isOwner])

  return { dataUrl, loading, containerRef }
}
