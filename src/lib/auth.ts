import { supabase } from './supabase'

export const OWNER_EMAIL = import.meta.env.VITE_OWNER_EMAIL as string | undefined

// Crypto helpers

export async function hashCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code.trim())
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function generateCode(length = 24): string {
  // Unambiguous characters (no 0/O, 1/l/I)
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

// Returns a stable per-browser ID used to de-duplicate guest sign-ins across sign-out cycles.
function getDeviceId(): string {
  const KEY = 'ownsheets-device-id'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(KEY, id)
  }
  return id
}

// Sign-in flows

export async function signInAsOwner(password: string): Promise<void> {
  if (!OWNER_EMAIL) throw new Error('VITE_OWNER_EMAIL is not set in your .env file.')
  const { error } = await supabase.auth.signInWithPassword({ email: OWNER_EMAIL, password })
  if (error) throw error
}

export async function signInAsGuest(code: string): Promise<void> {
  // 1. Create an anonymous Supabase session
  const { error: anonErr } = await supabase.auth.signInAnonymously()
  if (anonErr) throw anonErr

  // 2. Validate the code. Pass the stable device ID so the same browser always maps to the same row in validated_guests, even after sign-out.
  const hash = await hashCode(code)
  const deviceId = getDeviceId()
  const { data: valid, error: rpcErr } = await supabase.rpc('validate_guest_code', {
    p_code_hash: hash,
    p_device_id: deviceId,
  })
  if (rpcErr || !valid) {
    await supabase.auth.signOut()
    throw new Error('Invalid access code.')
  }
}

// Role helpers

export function isOwnerEmail(email?: string | null): boolean {
  return !!OWNER_EMAIL && email === OWNER_EMAIL
}
