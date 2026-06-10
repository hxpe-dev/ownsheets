import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Initialize the worker once here, all other files import pdfjsLib from this module.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

export { pdfjsLib }

export async function getPageCount(file: File): Promise<number> {
  const buffer = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise
  const count = doc.numPages
  doc.destroy()
  return count
}
