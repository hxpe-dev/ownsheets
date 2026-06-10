import { supabase } from './supabase'
import { getPageCount } from './pdf'
import { hashCode } from './auth'
import type { Setlist } from '../types'

// Access codes

export interface AccessCodeGuest {
  user_id: string
  last_seen_at: string
  download_count: number
  download_bytes: number
}

export interface AccessCode {
  id: string
  label: string
  created_at: string
  validated_guests: AccessCodeGuest[]
}

export async function getAccessCodes() {
  return supabase
    .from('access_codes')
    .select('id, label, created_at, validated_guests(user_id, last_seen_at, download_count, download_bytes)')
    .order('created_at')
}

export async function createAccessCode(label: string, code: string): Promise<void> {
  const code_hash = await hashCode(code)
  const { error } = await supabase.from('access_codes').insert({ label, code_hash })
  if (error) throw error
}

export async function deleteAccessCode(id: string): Promise<void> {
  const { error } = await supabase.from('access_codes').delete().eq('id', id)
  if (error) throw error
}

export async function touchGuestSession() {
  await supabase.rpc('touch_guest_session')
}

export async function getStorageUsage(): Promise<number> {
  const { data } = await supabase.rpc('get_storage_usage')
  return (data as number) ?? 0
}

export async function recordGuestDownload(bytes: number) {
  await supabase.rpc('record_guest_download', { p_bytes: bytes })
}

export async function recordGuestEgress(bytes: number) {
  await supabase.rpc('record_guest_egress', { p_bytes: bytes })
}

// Sheets

export async function getSheets() {
  return supabase.from('sheets').select('*').order('title')
}

export async function uploadSheet(
  file: File,
  meta: { 
    title: string
    composer: string
    arranger: string
    key: string
    difficulty: number | null
    tags: string[] 
  },
) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const id = crypto.randomUUID()
  const path = `${user.id}/${id}.pdf`

  const { error: storageError } = await supabase.storage
    .from('sheets').upload(path, file, { contentType: 'application/pdf' })
  if (storageError) throw storageError

  const pageCount = await getPageCount(file)

  const { error } = await supabase.from('sheets').insert({
    id, owner_id: user.id,
    title: meta.title.trim(),
    composer: meta.composer.trim() || null,
    arranger: meta.arranger.trim() || null,
    key: meta.key.trim() || null,
    difficulty: meta.difficulty,
    tags: meta.tags, file_path: path, page_count: pageCount,
  })
  if (error) throw error
}

export async function updateSheet(
  id: string,
  meta: { 
    title: string
    composer: string
    arranger: string
    key: string
    difficulty: number | null
    tags: string[] 
  },
) {
  const { error } = await supabase.from('sheets').update({
    title: meta.title.trim(),
    composer: meta.composer.trim() || null,
    arranger: meta.arranger.trim() || null,
    key: meta.key.trim() || null,
    difficulty: meta.difficulty,
    tags: meta.tags,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
}

export async function deleteSheet(id: string, filePath: string) {
  await supabase.storage.from('sheets').remove([filePath])
  const { error } = await supabase.from('sheets').delete().eq('id', id)
  if (error) throw error
}

// Setlists

export async function getSetlists() {
  return supabase.from('setlists').select('*').order('name')
}

export async function createSetlist(name: string): Promise<Setlist> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('setlists').insert({ name: name.trim(), owner_id: user.id }).select().single()
  if (error) throw error
  return data as Setlist
}

export async function deleteSetlist(id: string) {
  return supabase.from('setlists').delete().eq('id', id)
}

export async function getSetlistSheets(setlistId: string) {
  return supabase
    .from('setlist_items').select('position, sheets(*)')
    .eq('setlist_id', setlistId).order('position')
}

export async function addToSetlist(setlistId: string, sheetId: string) {
  const { data } = await supabase
    .from('setlist_items').select('position')
    .eq('setlist_id', setlistId).order('position', { ascending: false }).limit(1)
  const position = (data?.[0]?.position ?? -1) + 1
  return supabase.from('setlist_items').insert({ setlist_id: setlistId, sheet_id: sheetId, position })
}

export async function removeFromSetlist(setlistId: string, sheetId: string) {
  return supabase.from('setlist_items').delete()
    .eq('setlist_id', setlistId).eq('sheet_id', sheetId)
}
