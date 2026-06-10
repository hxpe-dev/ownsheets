import { useEffect, useState } from 'react'
import { getSetlists, createSetlist, deleteSetlist, getSetlistSheets, removeFromSetlist } from '../lib/queries'
import { useThumbnail } from '../hooks/useThumbnail'
import type { Setlist, Sheet } from '../types'

interface Props {
  onViewSheet: (sheet: Sheet) => void
}

interface SetlistItem {
  position: number
  sheets: Sheet
}

function SheetThumb({ filePath, title }: { 
  filePath: string
  title: string 
}) {
  const { dataUrl, loading, containerRef } = useThumbnail(filePath)
  return (
    <div ref={containerRef} className="w-10 h-[56px] bg-zinc-900 rounded-lg shrink-0 overflow-hidden flex items-center justify-center">
      {dataUrl
        ? <img src={dataUrl} alt="" className="w-full h-full object-cover" />
        : loading
          ? <div className="w-3 h-3 border border-zinc-700 border-t-zinc-500 rounded-full animate-spin" />
          : <span className="text-xl font-thin text-zinc-700">{title[0].toUpperCase()}</span>
      }
    </div>
  )
}

export default function SetlistsRoute({ onViewSheet }: Props) {
  const [setlists, setSetlists] = useState<Setlist[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Setlist | null>(null)
  const [items, setItems] = useState<SetlistItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  async function loadSetlists() {
    const { data } = await getSetlists()
    setSetlists((data as Setlist[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { loadSetlists() }, [])

  async function openSetlist(s: Setlist) {
    setSelected(s)
    setItemsLoading(true)
    const { data } = await getSetlistSheets(s.id)
    setItems((data as unknown as SetlistItem[]) ?? [])
    setItemsLoading(false)
  }

  async function handleCreate(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      const created = await createSetlist(newName)
      setNewName('')
      await loadSetlists()
      openSetlist(created)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await deleteSetlist(id)
    setSetlists(prev => prev.filter(s => s.id !== id))
  }

  async function handleRemove(sheetId: string) {
    if (!selected) return
    await removeFromSetlist(selected.id, sheetId)
    setItems(prev => prev.filter(i => i.sheets.id !== sheetId))
  }

  // Setlist detail view
  if (selected) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <button onClick={() => setSelected(null)}
          className="flex items-center gap-2 text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer mb-8 text-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Setlists
        </button>

        <h2 className="text-xl font-medium text-zinc-100 tracking-tight mb-6">{selected.name}</h2>

        {itemsLoading ? (
          <div className="flex justify-center py-24">
            <div className="w-5 h-5 border border-zinc-800 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-zinc-600 text-sm text-center py-24">No sheets in this setlist yet.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item, idx) => {
              const s = item.sheets
              return (
                <div key={s.id}
                  className="group flex items-center gap-4 px-4 py-3 rounded-2xl border border-zinc-900 hover:border-zinc-800 transition-all duration-200">
                  <span className="text-zinc-700 text-xs tabular-nums w-5 shrink-0 text-right">{idx + 1}</span>

                  <SheetThumb filePath={s.file_path} title={s.title} />

                  <button onClick={() => onViewSheet(s)}
                    className="flex-1 text-left cursor-pointer min-w-0">
                    <p className="text-zinc-200 text-sm font-medium truncate">{s.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {s.composer && <span className="text-zinc-500 text-xs">{s.composer}</span>}
                      {s.key && <span className="text-[10px] text-zinc-600 border border-zinc-800 px-1.5 py-0.5 rounded-full">{s.key}</span>}
                      {s.difficulty !== null && <span className="text-[10px] text-zinc-600 border border-zinc-800 px-1.5 py-0.5 rounded-full">{s.difficulty}/10</span>}
                    </div>
                  </button>

                  <button onClick={() => handleRemove(s.id)}
                    className="shrink-0 text-zinc-800 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer p-1"
                    title="Remove from setlist">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Setlists grid
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {loading ? (
        <div className="flex justify-center py-32">
          <div className="w-5 h-5 border border-zinc-800 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {setlists.length === 0 && (
            <p className="text-zinc-600 text-sm text-center py-16">No setlists yet.</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-8">
            {setlists.map(s => (
              <div key={s.id} onClick={() => openSetlist(s)}
                className="group text-left px-5 py-4 bg-zinc-950 border border-zinc-900 hover:border-zinc-700 rounded-2xl transition-all duration-200 hover:scale-[1.01] cursor-pointer">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-zinc-200 text-sm font-medium leading-snug">{s.name}</p>
                  <button onClick={e => handleDelete(s.id, e)}
                    className="shrink-0 text-zinc-800 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer p-0.5 -mt-0.5"
                    title="Delete setlist">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <p className="text-zinc-700 text-xs mt-1">
                  {new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>

          <form onSubmit={handleCreate} className="flex items-center gap-3 max-w-sm">
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="New setlist name..."
              className="flex-1 bg-transparent border-b border-zinc-800 focus:border-zinc-600 text-zinc-200 text-sm py-2 outline-none placeholder-zinc-700 transition-colors" />
            <button type="submit" disabled={!newName.trim() || creating}
              className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-30 transition-colors cursor-pointer shrink-0">
              {creating ? '...' : 'Create'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}
