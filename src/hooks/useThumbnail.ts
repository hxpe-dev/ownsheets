import { useState, useEffect, useRef } from 'react'
import { pdfjsLib } from '../lib/pdf'
import { supabase } from '../lib/supabase'
import { useUser } from '../lib/UserContext'
import { readPDFCache, writePDFCache } from '../lib/pdfCache'
import { recordGuestEgress } from '../lib/queries'

const THUMBNAIL_CACHE_NAME = 'ownsheets-thumbnails-v2'

// One-time cleanup of the old data-URL cache format.
caches.delete('ownsheets-thumbnails-v1').catch(() => {})

// Limit how many PDFs render at once. Rendering is CPU-heavy, and without a cap
// every card visible on first load fires at the same time and locks up the page.
const MAX_CONCURRENT = Math.max(2, Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 2)))
let active = 0
const waiters: (() => void)[] = []

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++
    return Promise.resolve()
  }
  return new Promise(resolve => waiters.push(resolve))
}

function release() {
  const next = waiters.shift()
  if (next) next()       // hand the slot straight to the next waiter
  else active--
}

async function readThumbnailCache(filePath: string): Promise<Blob | null> {
  try {
    const cache = await caches.open(THUMBNAIL_CACHE_NAME)
    const response = await cache.match(filePath)
    return response ? response.blob() : null
  } catch {
    return null
  }
}

async function writeThumbnailCache(filePath: string, blob: Blob): Promise<void> {
  try {
    const cache = await caches.open(THUMBNAIL_CACHE_NAME)
    await cache.put(filePath, new Response(blob, { headers: { 'Content-Type': 'image/jpeg' } }))
  } catch { /* storage quota or private browsing */ }
}

async function renderThumbnail(filePath: string, isOwner: boolean): Promise<Blob | null> {
  // Cache hits are cheap and skip the concurrency queue entirely.
  const cached = await readThumbnailCache(filePath)
  if (cached) return cached

  await acquire()
  try {
    // Another card may have rendered the same file while we waited for a slot.
    const cachedAgain = await readThumbnailCache(filePath)
    if (cachedAgain) return cachedAgain

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

    // toBlob is async (does not block the main thread like toDataURL) and the
    // blob is lighter to store and decode than a base64 data URL.
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(b => resolve(b), 'image/jpeg', 0.82),
    )
    pdfDoc.destroy()
    canvas.width = 0   // free canvas memory (matters on iOS)
    canvas.height = 0

    if (!blob) return null
    await writeThumbnailCache(filePath, blob)
    return blob
  } finally {
    release()
  }
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

    let cancelled = false
    let objectUrl: string | null = null

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || fetched.current) return
      fetched.current = true
      setLoading(true)
      renderThumbnail(filePath, isOwner)
        .then(blob => {
          if (cancelled) return
          if (blob) {
            objectUrl = URL.createObjectURL(blob)
            setDataUrl(objectUrl)
          }
          setLoading(false)
        })
        .catch(() => { if (!cancelled) setLoading(false) })
    }, { threshold: 0.01, rootMargin: '300px' }) // start a little before the card scrolls in

    observer.observe(el)
    return () => {
      cancelled = true
      observer.disconnect()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [filePath, isOwner])

  return { dataUrl, loading, containerRef }
}
