import { useState, useRef, useCallback, useEffect } from 'react'
import { uploadSheet } from '../lib/queries'
import { TagInput } from './TagInput'
import { DifficultyPicker } from './DifficultyPicker'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  existingTags?: string[]
  initialFile?: File | null
}

export default function UploadModal({ open, onClose, onSuccess, existingTags = [], initialFile }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [composer, setComposer] = useState('')
  const [arranger, setArranger] = useState('')
  const [key, setKey] = useState('')
  const [difficulty, setDifficulty] = useState<number | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [showDetails, setShowDetails] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(f: File) {
    setFile(f)
    setTitle(f.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' '))
  }

  // Pre-load a file dropped from outside the modal
  useEffect(() => {
    if (initialFile) handleFile(initialFile)
  }, [initialFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.type === 'application/pdf') handleFile(f)
  }, [])

  function reset() {
    setFile(null)
    setTitle('')
    setComposer('')
    setArranger('')
    setKey('')
    setDifficulty(null)
    setTags([])
    setShowDetails(false)
    setError(null)
  }

  function close() {
    if (uploading) return
    reset()
    onClose()
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!file || !title.trim()) return
    setUploading(true)
    setError(null)
    try {
      await uploadSheet(file, { title, composer, arranger, key, difficulty, tags })
      reset()
      onSuccess()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 transition-all duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={close} />
      <div className={`relative w-full sm:max-w-md bg-[#0c0c0c] border border-zinc-800/60 rounded-t-3xl sm:rounded-3xl p-8 transition-all duration-300 max-h-[92svh] overflow-y-auto ${open ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}>
        <h2 className="text-base font-medium text-zinc-100 mb-7 tracking-tight">Add sheet</h2>

        {/* Drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border border-dashed rounded-2xl p-7 text-center cursor-pointer transition-all duration-200 mb-7 ${dragging ? 'border-indigo-500/70 bg-indigo-500/5'
              : file ? 'border-zinc-700/50 bg-zinc-900/30'
                : 'border-zinc-800/80 hover:border-zinc-700/60 hover:bg-zinc-900/20'
            }`}
        >
          <input ref={fileRef} type="file" accept=".pdf" className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }} />
          {file ? (
            <div className="space-y-1">
              <p className="text-zinc-200 text-sm font-medium">{file.name}</p>
              <p className="text-zinc-500 text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">Drop a PDF here or <span className="text-zinc-300">browse</span></p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label="Title" value={title} onChange={setTitle} placeholder="Moonlight Sonata" required />

          {/* Composer + Arranger side by side */}
          <div className="grid grid-cols-2 gap-5">
            <Field label="Composer" value={composer} onChange={setComposer} placeholder="Beethoven" />
            <Field label="Arranger" value={arranger} onChange={setArranger} placeholder="arr. J. Smith" />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-widest text-zinc-500 mb-2">Tags</label>
            <TagInput value={tags} onChange={setTags} suggestions={existingTags} />
          </div>

          {/* Collapsible details: key + difficulty only */}
          <div>
            <button type="button" onClick={() => setShowDetails(v => !v)}
              className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer select-none">
              <svg className={`w-3 h-3 transition-transform duration-200 ${showDetails ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Details
            </button>

            {showDetails && (
              <div className="mt-5 space-y-5">
                <Field label="Key" value={key} onChange={setKey} placeholder="C major" />
                <div>
                  <label className="block text-[11px] uppercase tracking-widest text-zinc-500 mb-3">
                    Difficulty
                    {difficulty !== null && <span className="ml-2 normal-case tracking-normal text-zinc-400">{difficulty}/10</span>}
                  </label>
                  <DifficultyPicker value={difficulty} onChange={setDifficulty} />
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={close} disabled={uploading}
              className="flex-1 py-2.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={!file || !title.trim() || uploading}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer">
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
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
      <label className="block text-[11px] uppercase tracking-widest text-zinc-500 mb-2">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} required={required}
        className="w-full bg-transparent border-b border-zinc-800 focus:border-zinc-600 text-zinc-200 text-sm py-2 outline-none placeholder-zinc-600 transition-colors" />
    </div>
  )
}
