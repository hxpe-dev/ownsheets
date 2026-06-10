import { useState } from 'react'
import { signInAsOwner, signInAsGuest } from '../lib/auth'

export default function AuthRoute() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    setError(null)

    // Try owner password first, then guest code
    try {
      await signInAsOwner(code)
      return
    } catch {
      // Not the owner, try as guest
    }

    try {
      await signInAsGuest(code)
    } catch {
      setError('Incorrect password or access code.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <div className="mb-10">
          <h1 className="text-2xl font-medium text-zinc-100 tracking-tight">ownSheets</h1>
          <p className="text-zinc-600 text-sm mt-1">Enter your password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-zinc-600 mb-2">
              Password
            </label>
            <input
              type="password"
              value={code}
              onChange={e => setCode(e.target.value)}
              autoFocus
              autoComplete="current-password"
              disabled={loading}
              className="w-full bg-transparent border-b border-zinc-800 focus:border-zinc-600 text-zinc-200 text-sm py-2 outline-none placeholder-zinc-700 transition-colors disabled:opacity-50"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={!code.trim() || loading}
            className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-200 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-3.5 h-3.5 border border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                Verifying...
              </>
            ) : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}
