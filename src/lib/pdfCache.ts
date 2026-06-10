const PDF_CACHE_NAME = 'ownsheets-pdfs-v1'

export async function readPDFCache(filePath: string): Promise<ArrayBuffer | null> {
  try {
    const cache = await caches.open(PDF_CACHE_NAME)
    const res = await cache.match(filePath)
    return res ? res.arrayBuffer() : null
  } catch { return null }
}

export async function writePDFCache(filePath: string, buffer: ArrayBuffer): Promise<void> {
  try {
    const cache = await caches.open(PDF_CACHE_NAME)
    await cache.put(filePath, new Response(buffer, { headers: { 'Content-Type': 'application/pdf' } }))
  } catch { /* storage quota or private browsing */ }
}
