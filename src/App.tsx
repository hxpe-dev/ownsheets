import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import LibraryRoute from './routes/Library'
import AuthRoute from './routes/Auth'
import { UserContext } from './lib/UserContext'
import { isOwnerEmail } from './lib/auth'
import { touchGuestSession } from './lib/queries'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [checking, setChecking] = useState(false)
  const checkingRef = useRef(false)

  useEffect(() => {
    let active = true

    async function resolveSession(s: Session | null) {
      // Anonymous sessions must have a validated_guests row to be allowed in.
      // On the very first use of a code the row is written by validate_guest_code()
      // a moment after the anonymous session appears, so poll briefly before
      // deciding the guest is unvalidated (or revoked).
      if (s && s.user.is_anonymous) {
        checkingRef.current = true
        setChecking(true)
        let validated = false
        for (let i = 0; i < 15 && active; i++) {
          const { data: vg } = await supabase
            .from('validated_guests')
            .select('user_id')
            .eq('user_id', s.user.id)
            .maybeSingle()
          if (vg) { validated = true; break }
          await new Promise(r => setTimeout(r, 200))
        }
        if (!active) return
        if (validated) {
          setSession(s)
          touchGuestSession() // update last_seen_at for usage tracking
        } else {
          await supabase.auth.signOut()
          setSession(null)
        }
        checkingRef.current = false
        setChecking(false)
      } else {
        setSession(s)
      }
    }

    supabase.auth.getSession().then(({ data }) => resolveSession(data.session))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      // Skip events fired while a validation poll is already running
      if (!checkingRef.current) resolveSession(s)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  if (session === undefined || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#080808]">
        <div className="w-5 h-5 border border-zinc-800 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <UserContext.Provider value={{ isOwner: isOwnerEmail(session?.user?.email) }}>
      {session ? <LibraryRoute /> : <AuthRoute />}
    </UserContext.Provider>
  )
}
