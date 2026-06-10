import { useEffect, useState } from 'react'
import { getSetlists, createSetlist, addToSetlist } from '../lib/queries'
import type { Setlist } from '../types'

interface Props {
  sheetId: string
  onClose: () => void
}

export default function SetlistPickerModal({ sheetId, onClose }: Props) {
  const [setlists, setSetlists] = useState<Setlist[]>([])
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    getSetlists().then(({ data }) => setSetlists((data as Setlist[]) ?? []))
  }, [])

  async function handleAdd(setlist: Setlist) {
    setAdding(setlist.id)
    await addToSetlist(setlist.id, sheetId)
    setDone(setlist.id)
    setAdding(null)
    setTimeout(onClose, 600)
  }

  async function handleCreate(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      const created = await createSetlist(newName)
      await addToSetlist(created.id, sheetId)
      setDone(created.id)
      setTimeout(onClose, 600)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full sm:max-w-xs bg-[#0c0c0c] border border-zinc-800/60 rounded-t-3xl sm:rounded-3xl p-6 flex flex-col gap-1">
        <h2 className="text-sm font-medium text-zinc-200 mb-4">Add to setlist</h2>

        {setlists.length === 0 && !creating && (
          <p className="text-zinc-600 text-xs mb-3">No setlists yet, create one below.</p>
        )}

        {/* Existing setlists */}
        <div className="space-y-1 mb-3">
          {setlists.map(s => (
            <button
              key={s.id}
              onClick={() => handleAdd(s)}
              disabled={adding !== null || done !== null}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-zinc-900 transition-colors cursor-pointer disabled:opacity-50 text-left"
            >
              <span className="text-sm text-zinc-300">{s.name}</span>
              {done === s.id ? (
                <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : adding === s.id ? (
                <div className="w-3.5 h-3.5 border border-zinc-600 border-t-indigo-400 rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              )}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-zinc-800/60 pt-3">
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="New setlist..."
              className="flex-1 bg-transparent border-b border-zinc-800 focus:border-zinc-600 text-zinc-200 text-sm py-1.5 outline-none placeholder-zinc-700 transition-colors"
            />
            <button
              type="submit"
              disabled={!newName.trim() || creating}
              className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-30 transition-colors cursor-pointer shrink-0"
            >
              {creating ? '...' : 'Create'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
