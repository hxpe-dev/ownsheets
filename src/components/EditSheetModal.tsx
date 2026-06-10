import { useState } from 'react'
import { updateSheet, deleteSheet } from '../lib/queries'
import type { Sheet } from '../types'
import { TagInput } from './TagInput'
import { DifficultyPicker } from './DifficultyPicker'

interface Props {
  sheet: Sheet
  open: boolean
  onClose: () => void
  onSuccess: () => void
  existingTags?: string[]
}

export default function EditSheetModal({ sheet, open, onClose, onSuccess, existingTags = [] }: Props) {
  const [title, setTitle] = useState(sheet.title)
  const [composer, setComposer] = useState(sheet.composer ?? '')
  const [arranger, setArranger] = useState(sheet.arranger ?? '')
  const [key, setKey] = useState(sheet.key ?? '')
  const [difficulty, setDifficulty] = useState<number | null>(sheet.difficulty)
  const [tags, setTags] = useState<string[]>(sheet.tags)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    if (saving || deleting) return
    setConfirmDelete(false)
    onClose()
  }

  async function handleSave(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    try {
      await updateSheet(sheet.id, { title, composer, arranger, key, difficulty, tags })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await deleteSheet(sheet.id, sheet.file_path)
      onSuccess()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      setDeleting(false)
    }
  }

  return (
    <div className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 transition-all duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={close} />
      <div className={`relative w-full sm:max-w-md bg-[#0c0c0c] border border-zinc-800/60 rounded-t-3xl sm:rounded-3xl p-8 transition-all duration-300 max-h-[92svh] overflow-y-auto ${open ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}>
        <h2 className="text-base font-medium text-zinc-100 mb-7 tracking-tight">Edit sheet</h2>

        <form onSubmit={handleSave} className="space-y-5">
          <Field label="Title" value={title} onChange={setTitle} placeholder="Moonlight Sonata" required />
          <div className="grid grid-cols-2 gap-5">
            <Field label="Composer" value={composer} onChange={setComposer} placeholder="Beethoven" />
            <Field label="Arranger" value={arranger} onChange={setArranger} placeholder="arr. J. Smith" />
          </div>
          <Field label="Key" value={key} onChange={setKey} placeholder="C major" />

          <div>
            <label className="block text-[11px] uppercase tracking-widest text-zinc-600 mb-2">Tags</label>
            <TagInput value={tags} onChange={setTags} suggestions={existingTags} />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-widest text-zinc-600 mb-3">
              Difficulty
              {difficulty !== null && <span className="ml-2 normal-case tracking-normal text-zinc-500">{difficulty}/10</span>}
            </label>
            <DifficultyPicker value={difficulty} onChange={setDifficulty} />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={close} disabled={saving || deleting}
              className="flex-1 py-2.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={!title.trim() || saving || deleting}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>

        {/* Delete section */}
        <div className="mt-6 pt-5 border-t border-zinc-900">
          {confirmDelete ? (
            <div className="flex items-center gap-3">
              <p className="text-zinc-500 text-xs flex-1">Delete this sheet permanently?</p>
              <button onClick={() => setConfirmDelete(false)}
                className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40 transition-colors cursor-pointer">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="text-xs text-zinc-700 hover:text-red-400 transition-colors cursor-pointer">
              Delete sheet...
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, required }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-widest text-zinc-600 mb-2">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} required={required}
        className="w-full bg-transparent border-b border-zinc-800 focus:border-zinc-600 text-zinc-200 text-sm py-2 outline-none placeholder-zinc-700 transition-colors" />
    </div>
  )
}
