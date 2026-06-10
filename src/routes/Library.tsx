import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getSheets } from '../lib/queries'
import { useUser } from '../lib/UserContext'
import type { Sheet } from '../types'
import SheetCard, { SheetCardSkeleton } from '../components/SheetCard'
import UploadModal from '../components/UploadModal'
import EditSheetModal from '../components/EditSheetModal'
import SetlistPickerModal from '../components/SetlistPickerModal'
import SetlistsRoute from './Setlists'
import SettingsRoute from './Settings'
import PDFViewer from '../viewer/PDFViewer'

const OWNER_NAME = (import.meta.env.VITE_OWNER_NAME as string | undefined) || ''

type Tab = 'library' | 'setlists' | 'settings'

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  library: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
    </svg>
  ),
  setlists: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
}

export default function LibraryRoute() {
  const { isOwner } = useUser()
  const [tab, setTab] = useState<Tab>('library')
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [dropFile, setDropFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [editing, setEditing] = useState<Sheet | null>(null)
  const [viewing, setViewing] = useState<Sheet | null>(null)
  const [addingSheetId, setAddingSheetId] = useState<string | null>(null)

  async function load() {
    const { data } = await getSheets()
    setSheets(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Global drag-and-drop, owner only
  useEffect(() => {
    if (!isOwner) return
    function onDragOver(e: DragEvent) {
      e.preventDefault()
      if (e.dataTransfer?.types.includes('Files')) setDragOver(true)
    }
    function onDragLeave(e: DragEvent) {
      if (!e.relatedTarget) setDragOver(false)
    }
    function onDrop(e: DragEvent) {
      e.preventDefault()
      setDragOver(false)
      const f = e.dataTransfer?.files[0]
      if (f?.type === 'application/pdf') {
        setDropFile(f)
        setShowUpload(true)
        setTab('library')
      }
    }
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop)
    }
  }, [isOwner])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    sheets.forEach(s => s.tags.forEach(t => set.add(t)))
    return [...set].sort()
  }, [sheets])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return sheets.filter(s => {
      const matchSearch = !q ||
        s.title.toLowerCase().includes(q) ||
        (s.composer ?? '').toLowerCase().includes(q) ||
        s.tags.some(t => t.includes(q))
      const matchTag = !activeTag || s.tags.includes(activeTag)
      return matchSearch && matchTag
    })
  }, [sheets, search, activeTag])

  const tabs: Tab[] = isOwner ? ['library', 'setlists', 'settings'] : ['library', 'setlists']

  return (
    <div className="min-h-screen bg-[#080808] text-white">

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#080808]/90 backdrop-blur-xl border-b border-zinc-900/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3 sm:gap-5">
          <div className="flex items-center gap-2.5 shrink-0">
            <img src="/favicon.svg" alt="ownSheets" className="h-7 w-auto" />
            <span className="hidden sm:block text-sm font-medium text-zinc-200 truncate max-w-[160px]">
              {OWNER_NAME ? `${OWNER_NAME}'s sheets` : 'ownSheets'}
            </span>
          </div>

          {/* Desktop nav: hidden on mobile (bottom bar used instead) */}
          <nav className="hidden sm:flex items-center gap-1">
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer capitalize ${tab === t ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                  }`}>
                {t}
              </button>
            ))}
          </nav>

          {/* Search: only on library tab */}
          {tab === 'library' && (
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input type="search" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full bg-zinc-900/50 border border-zinc-800/60 hover:border-zinc-700/60 focus:border-zinc-600 rounded-xl pl-9 pr-4 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors" />
            </div>
          )}

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
            {tab === 'library' && isOwner && (
              <button onClick={() => setShowUpload(true)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3 sm:px-3.5 py-1.5 rounded-xl transition-all duration-200 hover:scale-[1.03] active:scale-95 cursor-pointer">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add
              </button>
            )}
            <a href="https://github.com/hxpe-dev/ownsheets" target="_blank" rel="noopener noreferrer"
              title="GitHub" className="text-zinc-700 hover:text-zinc-400 transition-colors p-1">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
            </a>
            <button onClick={() => supabase.auth.signOut()} title="Sign out"
              className="text-zinc-700 hover:text-zinc-400 transition-colors cursor-pointer p-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Content: pb-20 on mobile to clear the bottom nav bar */}
      <div className="pb-20 sm:pb-0">
        {tab === 'setlists' ? (
          <SetlistsRoute onViewSheet={setViewing} />
        ) : tab === 'settings' ? (
          <SettingsRoute />
        ) : (
          <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
            {loading ? (
              <div className="flex gap-2 mb-6 sm:mb-8 animate-pulse">
                {[52, 68, 44, 76, 56].map((w, i) => (
                  <div key={i} className="h-[26px] bg-zinc-900 border border-zinc-800/50 rounded-full" style={{ width: w }} />
                ))}
              </div>
            ) : allTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6 sm:mb-8">
                {allTags.map(tag => (
                  <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                    className={`text-xs px-3 py-1 rounded-full border transition-all duration-200 cursor-pointer ${activeTag === tag
                        ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-300'
                        : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                      }`}>
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {Array.from({ length: 10 }).map((_, i) => <SheetCardSkeleton key={i} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 gap-3">
                {sheets.length === 0 ? (
                  <>
                    <p className="text-zinc-600 text-sm">No sheets yet</p>
                    {isOwner && (
                      <button onClick={() => setShowUpload(true)} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer">
                        Upload your first PDF
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-zinc-600 text-sm">No results for "{search || activeTag}"</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {filtered.map(sheet => (
                  <SheetCard
                    key={sheet.id}
                    sheet={sheet}
                    onClick={() => setViewing(sheet)}
                    onEdit={isOwner ? () => setEditing(sheet) : undefined}
                    onAddToSetlist={isOwner ? () => setAddingSheetId(sheet.id) : undefined}
                  />
                ))}
              </div>
            )}
          </main>
        )}
      </div>

      {/* Mobile bottom nav: hidden on sm+ (desktop uses header nav) */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#080808]/95 backdrop-blur-xl border-t border-zinc-900/80 flex">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors cursor-pointer ${tab === t ? 'text-zinc-100' : 'text-zinc-600 active:text-zinc-400'
              }`}>
            {TAB_ICONS[t]}
            <span className="text-[10px] font-medium capitalize">{t}</span>
          </button>
        ))}
      </nav>

      {/* Global drag-drop overlay */}
      {dragOver && isOwner && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-indigo-500/60 rounded-3xl px-20 py-14 text-center">
            <svg className="w-10 h-10 text-indigo-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-indigo-300 text-base font-medium">Drop PDF to add</p>
          </div>
        </div>
      )}

      {isOwner && (
        <>
          <UploadModal
            open={showUpload}
            onClose={() => {
              setShowUpload(false)
              setDropFile(null)
            }}
            onSuccess={load}
            existingTags={allTags}
            initialFile={dropFile}
          />
          {editing && (
            <EditSheetModal sheet={editing} open={!!editing} onClose={() => setEditing(null)} onSuccess={load} existingTags={allTags} />
          )}
          {addingSheetId && (
            <SetlistPickerModal sheetId={addingSheetId} onClose={() => setAddingSheetId(null)} />
          )}
        </>
      )}

      {viewing && <PDFViewer sheet={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
