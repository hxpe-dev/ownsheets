import { useRef, useState } from 'react'

interface Props {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
}

export function TagInput({ value, onChange, suggestions = [] }: Props) {
  const [input, setInput] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = suggestions.filter(
    s => s.includes(input.toLowerCase()) && !value.includes(s)
  ).slice(0, 6)

  function add(tag: string) {
    const t = tag.trim().toLowerCase()
    if (t && !value.includes(t)) onChange([...value, t])
    setInput('')
  }

  function remove(tag: string) {
    onChange(value.filter(t => t !== tag))
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(input)
    } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
      remove(value[value.length - 1])
    }
  }

  const showDropdown = focused && filtered.length > 0

  return (
    <div className="relative">
      {/* Inline chips + input */}
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex flex-wrap items-center gap-1.5 border-b border-zinc-800 focus-within:border-zinc-600 pb-2 transition-colors cursor-text"
      >
        {value.map(t => (
          <span key={t} className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs px-2.5 py-1 rounded-full">
            {t}
            <button
              type="button"
              onMouseDown={e => {
                e.preventDefault()
                remove(t)
              }}
              className="text-zinc-700 hover:text-zinc-400 transition-colors leading-none cursor-pointer"
            >x</button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setTimeout(() => setFocused(false), 120)
            add(input)
          }}
          placeholder={value.length === 0 ? 'Add tags...' : ''}
          className="flex-1 min-w-[80px] bg-transparent text-zinc-200 text-sm py-1 outline-none placeholder-zinc-700"
        />
      </div>

      {/* Autocomplete dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 bg-zinc-900 border border-zinc-800 rounded-xl mt-1.5 py-1 z-10 shadow-xl shadow-black/50">
          {filtered.map(tag => (
            <button
              key={tag}
              type="button"
              onMouseDown={e => {
                e.preventDefault()
                add(tag)
              }}
              className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
