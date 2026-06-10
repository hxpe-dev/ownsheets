interface Props {
  value: number | null
  onChange: (v: number | null) => void
}

// Segment colors run from green (easy) through yellow and orange to red (hard).
function segmentColor(n: number): string {
  const t = (n - 1) / 9
  const hue = Math.round(120 - t * 120)
  const sat = Math.round(60 + t * 20)
  const lit = Math.round(45 + t * 10)
  return `hsl(${hue}, ${sat}%, ${lit}%)`
}

export function DifficultyPicker({ value, onChange }: Props) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
        const active = value !== null && n <= value
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            className="flex-1 h-7 rounded text-xs font-medium transition-colors duration-100 cursor-pointer border"
            style={active
              ? { backgroundColor: segmentColor(n), borderColor: 'transparent', color: '#fff' }
              : { backgroundColor: 'transparent', borderColor: 'rgb(39 39 42)', color: 'rgb(82 82 91)' }
            }
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}
