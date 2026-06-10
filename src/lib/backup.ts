import { strToU8, strFromU8, zipSync, unzipSync } from 'fflate'
import { supabase } from './supabase'
import { readPDFCache } from './pdfCache'
import type { Sheet } from '../types'

interface ManifestSheet {
  id: string
  title: string
  composer: string | null
  arranger: string | null
  key: string | null
  difficulty: number | null
  page_count: number | null
  notes: string | null
  tags: string[]
  pdf_file: string
}

interface ManifestSetlist {
  name: string
  sheet_ids: string[]
}

interface Manifest {
  version: 1
  exported_at: string
  sheets: ManifestSheet[]
  setlists: ManifestSetlist[]
}

export async function exportBackup(onProgress: (done: number, total: number) => void): Promise<void> {
  const [sheetsResult, setlistsResult] = await Promise.all([
    supabase.from('sheets').select('*').order('title'),
    supabase.from('setlists').select('id, name, setlist_items(position, sheet_id)').order('name'),
  ])

  const sheets = (sheetsResult.data ?? []) as Sheet[]
  const setlists = setlistsResult.data ?? []
  const total = sheets.length
  let done = 0

  const files: Record<string, Uint8Array> = {}
  const manifestSheets: ManifestSheet[] = []

  for (const sheet of sheets) {
    const pdfFile = `pdfs/${sheet.id}.pdf`

    let buffer = await readPDFCache(sheet.file_path)
    if (!buffer) {
      const { data } = await supabase.storage.from('sheets').createSignedUrl(sheet.file_path, 3600)
      if (!data?.signedUrl) throw new Error(`Could not get download URL for "${sheet.title}"`)
      const res = await fetch(data.signedUrl)
      if (!res.ok) throw new Error(`Download failed for "${sheet.title}"`)
      buffer = await res.arrayBuffer()
    }

    files[pdfFile] = new Uint8Array(buffer)
    manifestSheets.push({
      id: sheet.id,
      title: sheet.title,
      composer: sheet.composer,
      arranger: sheet.arranger,
      key: sheet.key,
      difficulty: sheet.difficulty,
      page_count: sheet.page_count,
      notes: sheet.notes,
      tags: sheet.tags ?? [],
      pdf_file: pdfFile,
    })

    done++
    onProgress(done, total)
  }

  const manifestSetlists: ManifestSetlist[] = setlists.map(sl => {
    const items = (sl.setlist_items ?? []) as { 
      position: number
      sheet_id: string 
    }[]
    
    return {
      name: sl.name,
      sheet_ids: [...items].sort((a, b) => a.position - b.position).map(i => i.sheet_id),
    }
  })

  const manifest: Manifest = {
    version: 1,
    exported_at: new Date().toISOString(),
    sheets: manifestSheets,
    setlists: manifestSetlists,
  }

  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))

  // PDFs are already compressed internally, so store without re-compressing
  const zipped = zipSync(files, { level: 0 })

  const blob = new Blob([zipped], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ownsheets-backup-${new Date().toISOString().slice(0, 10)}.zip`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importBackup(
  file: File,
  onProgress: (done: number, total: number) => void,
): Promise<number> {
  const buffer = await file.arrayBuffer()
  const unzipped = unzipSync(new Uint8Array(buffer))

  const manifestBytes = unzipped['manifest.json']
  if (!manifestBytes) throw new Error('Invalid backup: missing manifest.json')

  const manifest = JSON.parse(strFromU8(manifestBytes)) as Manifest
  if (manifest.version !== 1) throw new Error(`Unsupported backup version: ${manifest.version}`)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const total = manifest.sheets.length + manifest.setlists.length
  let done = 0

  const idMap = new Map<string, string>() // maps old sheet ids to the new ids created on import

  for (const sheetMeta of manifest.sheets) {
    const pdfBytes = unzipped[sheetMeta.pdf_file]
    if (!pdfBytes) throw new Error(`Backup is missing PDF: ${sheetMeta.pdf_file}`)

    const newId = crypto.randomUUID()
    const newPath = `${user.id}/${newId}.pdf`

    const { error: uploadError } = await supabase.storage
      .from('sheets')
      .upload(newPath, pdfBytes, { contentType: 'application/pdf' })
    if (uploadError) throw new Error(`Upload failed for "${sheetMeta.title}": ${uploadError.message}`)

    const { error: insertError } = await supabase.from('sheets').insert({
      id: newId,
      owner_id: user.id,
      title: sheetMeta.title,
      composer: sheetMeta.composer,
      arranger: sheetMeta.arranger,
      key: sheetMeta.key,
      difficulty: sheetMeta.difficulty,
      page_count: sheetMeta.page_count,
      notes: sheetMeta.notes,
      tags: sheetMeta.tags,
      file_path: newPath,
    })
    if (insertError) throw new Error(`DB insert failed for "${sheetMeta.title}": ${insertError.message}`)

    idMap.set(sheetMeta.id, newId)
    done++
    onProgress(done, total)
  }

  for (const setlistMeta of manifest.setlists) {
    const { data: setlist, error: slError } = await supabase
      .from('setlists')
      .insert({ owner_id: user.id, name: setlistMeta.name })
      .select()
      .single()
    if (slError) throw new Error(`Failed to create setlist "${setlistMeta.name}": ${slError.message}`)

    const items = setlistMeta.sheet_ids
      .map((oldId, position) => ({ setlist_id: setlist.id, sheet_id: idMap.get(oldId), position }))
      .filter(item => item.sheet_id != null)

    if (items.length > 0) {
      const { error: itemError } = await supabase.from('setlist_items').insert(items)
      if (itemError) throw new Error(`Failed to populate setlist "${setlistMeta.name}": ${itemError.message}`)
    }

    done++
    onProgress(done, total)
  }

  return manifest.sheets.length
}
