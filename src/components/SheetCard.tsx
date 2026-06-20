import { useThumbnail } from '../hooks/useThumbnail'
import type { Sheet } from '../types'

interface Props {
  sheet: Sheet
  onClick: () => void
  onEdit?: () => void
  onAddToSetlist?: () => void
}

export default function SheetCard({ sheet, onClick, onEdit, onAddToSetlist }: Props) {
  const { dataUrl, loading, containerRef } = useThumbnail(sheet.file_path)
  const showActions = onEdit || onAddToSetlist

  return (
    <div className="group relative h-full">
      <button
        onClick={onClick}
        className="text-left w-full h-full flex flex-col bg-zinc-950 border border-zinc-900 hover:border-zinc-700 rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/60 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div ref={containerRef} className="aspect-[3/4] bg-zinc-900 relative overflow-hidden shrink-0">
          {dataUrl ? (
            <img src={dataUrl} alt="" className="w-full h-full object-cover" />
          ) : loading ? (
            <div className="w-full h-full bg-zinc-800 animate-pulse" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-6xl font-thin text-zinc-800 select-none transition-all duration-500 group-hover:text-zinc-700 group-hover:scale-110">{sheet.title[0].toUpperCase()}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/10 to-transparent" />
        </div>

        <div className="px-3.5 pb-3.5 -mt-5 relative flex-1">
          <p className="text-zinc-100 text-sm font-medium leading-snug truncate">{sheet.title}</p>
          {sheet.composer && <p className="text-zinc-500 text-xs mt-0.5 truncate">{sheet.composer}</p>}
          {sheet.arranger && <p className="text-zinc-600 text-xs mt-0.5 truncate">{sheet.arranger}</p>}
          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
            {sheet.key && (
              <span className="text-[10px] text-zinc-500 border border-zinc-800/80 px-2 py-0.5 rounded-full">{sheet.key}</span>
            )}
            {sheet.difficulty !== null && (
              <span className="text-[10px] text-zinc-600 border border-zinc-800/80 px-2 py-0.5 rounded-full">{sheet.difficulty}/10</span>
            )}
            {sheet.tags.slice(0, 2).map(t => (
              <span key={t} className="text-[10px] text-zinc-600 border border-zinc-800/80 px-2 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
        </div>
      </button>

      {/* Hover action buttons */}
      {showActions && (
        <div className="absolute top-2.5 right-2.5 flex gap-1 opacity-100 can-hover:opacity-0 can-hover:group-hover:opacity-100 transition-opacity duration-200">
          {onEdit && (
            <button
              onClick={e => {
                e.stopPropagation()
                onEdit()
              }}
              title="Edit"
              className="w-7 h-7 rounded-lg bg-black/70 backdrop-blur-sm border border-zinc-700/50 text-zinc-400 hover:text-white hover:border-zinc-500 flex items-center justify-center transition-all duration-150 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
              </svg>
            </button>
          )}
          {onAddToSetlist && (
            <button
              onClick={e => {
                e.stopPropagation()
                onAddToSetlist()
              }}
              title="Add to setlist"
              className="w-7 h-7 rounded-lg bg-black/70 backdrop-blur-sm border border-zinc-700/50 text-zinc-400 hover:text-white hover:border-zinc-500 flex items-center justify-center transition-all duration-150 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function SheetCardSkeleton() {
  return (
    <div className="h-full flex flex-col rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-900 animate-pulse">
      <div className="aspect-[3/4] bg-zinc-900 shrink-0" />
      <div className="px-3.5 pb-3.5 -mt-5 relative flex-1">
        {/* title: text-sm leading-snug */}
        <div className="h-5 bg-zinc-800 rounded-sm w-4/5" />
        {/* composer: text-xs mt-0.5 */}
        <div className="h-[18px] bg-zinc-800/60 rounded-full w-3/5 mt-0.5" />
        {/* arranger: text-xs mt-0.5 */}
        <div className="h-[18px] bg-zinc-800/40 rounded-full w-2/5 mt-0.5" />
        {/* tags row: mt-2.5 + badge height */}
        <div className="flex gap-1.5 mt-2.5">
          <div className="h-[18px] bg-zinc-800/40 rounded-full w-10" />
          <div className="h-[18px] bg-zinc-800/30 rounded-full w-14" />
        </div>
      </div>
    </div>
  )
}
