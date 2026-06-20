import { useEffect, useRef, useState } from 'react'
import { getAccessCodes, createAccessCode, deleteAccessCode, getStorageUsage, type AccessCode } from '../lib/queries'
import { generateCode } from '../lib/auth'
import { exportBackup, importBackup } from '../lib/backup'

const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024 // 1 GB is Supabase free tier

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function codeStats(code: AccessCode) {
  const guests = code.validated_guests ?? []
  const deviceCount = guests.length
  const totalDownloads = guests.reduce((s, g) => s + g.download_count, 0)
  const totalBytes = guests.reduce((s, g) => s + g.download_bytes, 0)
  const lastActive = guests.length
    ? new Date(Math.max(...guests.map(g => new Date(g.last_seen_at).getTime())))
    : null
  return { deviceCount, totalDownloads, totalBytes, lastActive }
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function SettingsRoute() {
  const [codes, setCodes] = useState<AccessCode[]>([])
  const [loading, setLoading] = useState(true)
  const [storageBytes, setStorageBytes] = useState<number | null>(null)
  const [label, setLabel] = useState('')
  const [code, setCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [revealed, setRevealed] = useState<{ id: string; code: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Backup
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)
  const [backupError, setBackupError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<number | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    const { data } = await getAccessCodes()
    setCodes((data as AccessCode[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    getStorageUsage().then(setStorageBytes)
  }, [])

  function handleGenerate() {
    setCode(generateCode())
  }

  async function handleCreate(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!label.trim() || !code.trim()) return
    setCreating(true)
    setError(null)
    try {
      await createAccessCode(label, code)
      const { data } = await getAccessCodes()
      const fresh = (data as AccessCode[]) ?? []
      setCodes(fresh)
      const created = fresh.find(c => c.label === label.trim())
      setRevealed(created ? { id: created.id, code } : null)
      setLabel('')
      setCode('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create code')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    await deleteAccessCode(id)
    setCodes(prev => prev.filter(c => c.id !== id))
    setConfirmDelete(null)
    if (revealed?.id === id) setRevealed(null)
  }

  async function copyCode(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleExport() {
    setBackupError(null)
    setImportSuccess(null)
    try {
      await exportBackup((done, total) => setExportProgress({ done, total }))
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExportProgress(null)
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setBackupError(null)
    setImportSuccess(null)
    try {
      const count = await importBackup(file, (done, total) => setImportProgress({ done, total }))
      setImportSuccess(count)
      getStorageUsage().then(setStorageBytes)
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImportProgress(null)
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <h2 className="text-lg font-medium text-zinc-100 tracking-tight mb-1">Access codes</h2>
      <p className="text-zinc-600 text-sm mb-8">
        Share a code with someone to give them read-only access to your library.
        Codes are stored as hashes, the raw code is shown only once.
      </p>

      {/* Revealed code banner */}
      {revealed && (
        <div className="mb-6 bg-indigo-950/50 border border-indigo-700/40 rounded-2xl p-5 space-y-3">
          <p className="text-xs text-indigo-400 uppercase tracking-widest">Code created, copy it now</p>
          <div className="flex items-center gap-3">
            <code className="flex-1 text-indigo-200 text-sm font-mono bg-indigo-950/60 px-3 py-2 rounded-xl select-all">
              {revealed.code}
            </code>
            <button
              onClick={() => copyCode(revealed.code)}
              className="shrink-0 text-xs text-indigo-400 hover:text-indigo-200 transition-colors cursor-pointer border border-indigo-700/40 hover:border-indigo-500/60 px-3 py-2 rounded-xl"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button onClick={() => setRevealed(null)}
            className="text-xs text-indigo-700 hover:text-indigo-400 transition-colors cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Existing codes */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border border-zinc-800 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : codes.length === 0 ? (
        <p className="text-zinc-500 text-sm mb-8">No access codes yet.</p>
      ) : (
        <div className="space-y-2 mb-8">
          {codes.map(c => {
            const { deviceCount, totalDownloads, totalBytes, lastActive } = codeStats(c)
            return (
              <div key={c.id}
                className="group flex items-start gap-4 px-4 py-3.5 rounded-2xl border border-zinc-900 hover:border-zinc-800 transition-colors">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="text-zinc-200 text-sm font-medium truncate">{c.label}</p>

                  {/* Usage stats */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {deviceCount === 0 ? (
                      <span className="text-zinc-500 text-xs">Never used</span>
                    ) : (
                      <>
                        <span className="text-zinc-400 text-xs">
                          {deviceCount} {deviceCount === 1 ? 'device' : 'devices'}
                        </span>
                        <span className="text-zinc-600 text-xs">·</span>
                        <span className={`text-xs ${totalDownloads > 50 ? 'text-amber-500' : 'text-zinc-400'}`}>
                          {totalDownloads} {totalDownloads === 1 ? 'download' : 'downloads'}
                        </span>
                        {totalBytes > 0 && (
                          <>
                            <span className="text-zinc-600 text-xs">·</span>
                            <span className="text-zinc-400 text-xs">{formatBytes(totalBytes)} egress</span>
                          </>
                        )}
                        <span className="text-zinc-600 text-xs">·</span>
                        <span className="text-zinc-400 text-xs">
                          last active {timeAgo(lastActive!)}
                        </span>
                      </>
                    )}
                  </div>

                  <p className="text-zinc-600 text-xs">
                    Created {new Date(c.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>

                {confirmDelete === c.id ? (
                  <div className="flex items-center gap-3 shrink-0 mt-0.5">
                    <span className="text-xs text-zinc-500">Revoke?</span>
                    <button onClick={() => setConfirmDelete(null)}
                      className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer">Cancel</button>
                    <button onClick={() => handleDelete(c.id)}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer">Revoke</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(c.id)}
                    className="shrink-0 text-zinc-600 hover:text-red-400 opacity-100 can-hover:opacity-0 can-hover:group-hover:opacity-100 transition-all cursor-pointer text-xs mt-0.5"
                  >
                    Revoke
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} className="space-y-4">
        <p className="text-[11px] uppercase tracking-widest text-zinc-600">New access code</p>

        <div>
          <label className="block text-[11px] uppercase tracking-widest text-zinc-500 mb-2">Label</label>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Alice's phone"
            className="w-full bg-transparent border-b border-zinc-800 focus:border-zinc-600 text-zinc-200 text-sm py-2 outline-none placeholder-zinc-600 transition-colors"
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-widest text-zinc-500 mb-2">Code</label>
          <div className="flex items-center gap-3">
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Type or generate..."
              className="flex-1 bg-transparent border-b border-zinc-800 focus:border-zinc-600 text-zinc-200 text-sm py-2 outline-none placeholder-zinc-600 transition-colors font-mono"
            />
            <button type="button" onClick={handleGenerate}
              className="shrink-0 text-xs text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer border border-zinc-800 hover:border-zinc-700 px-2.5 py-1.5 rounded-lg">
              Generate
            </button>
          </div>
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <button
          type="submit"
          disabled={!label.trim() || !code.trim() || creating}
          className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-200 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer"
        >
          {creating ? 'Creating...' : 'Create code'}
        </button>
      </form>

      {/* Storage usage */}
      <div className="mt-10 pt-8 border-t border-zinc-900 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-widest text-zinc-600">Storage</p>
          <p className="text-xs text-zinc-500">
            {storageBytes === null
              ? '...'
              : `${formatBytes(storageBytes)} / 1 GB`}
          </p>
        </div>
        <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
          {storageBytes !== null && (() => {
            const pct = Math.min((storageBytes / STORAGE_LIMIT_BYTES) * 100, 100)
            const color = pct > 80 ? '#f87171' : pct > 60 ? '#fb923c' : '#6366f1'
            return (
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            )
          })()}
        </div>
        <p className="text-[11px] text-zinc-500">Supabase free tier limit. Upgrade your plan to increase storage.</p>
      </div>

      {/* Backup */}
      <div className="mt-8 pt-8 border-t border-zinc-900 space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-zinc-600 mb-1">Backup</p>
          <p className="text-xs text-zinc-500">
            Export all sheets and setlists to a ZIP file, or restore from a previous backup.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleExport}
            disabled={exportProgress !== null || importProgress !== null}
            className="flex-1 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 text-sm rounded-xl transition-all cursor-pointer"
          >
            {exportProgress
              ? `Exporting... ${exportProgress.done} / ${exportProgress.total}`
              : 'Export backup'}
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={exportProgress !== null || importProgress !== null}
            className="flex-1 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 text-sm rounded-xl transition-all cursor-pointer"
          >
            {importProgress
              ? `Importing... ${importProgress.done} / ${importProgress.total}`
              : 'Import backup'}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
        {backupError && <p className="text-red-400 text-xs">{backupError}</p>}
        {importSuccess !== null && (
          <p className="text-emerald-400 text-xs">
            Imported {importSuccess} {importSuccess === 1 ? 'sheet' : 'sheets'} successfully.
          </p>
        )}
      </div>

      {/* About */}
      <div className="mt-8 pt-8 border-t border-zinc-900 flex items-center justify-between">
        <p className="text-xs text-zinc-500">ownSheets - open source</p>
        <a
          href="https://github.com/hxpe-dev/ownsheets"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
          </svg>
          GitHub
        </a>
      </div>
    </div>
  )
}
