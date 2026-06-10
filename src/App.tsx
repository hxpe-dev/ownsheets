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
    supabase.auth.getSession().then(async ({ data }) => {
      const s = data.session
      // Anonymous sessions must still have a validated_guests row, revoked guests get signed out here.
      if (s && s.user.is_anonymous) {
        checkingRef.current = true
        setChecking(true)
        const { data: vg } = await supabase
          .from('validated_guests')
          .select('user_id')
          .eq('user_id', s.user.id)
          .maybeSingle()
        if (!vg) {
          await supabase.auth.signOut()
          setSession(null)
        } else {
          setSession(s)
          touchGuestSession() // update last_seen_at for usage tracking
        }
        checkingRef.current = false
        setChecking(false)
      } else {
        setSession(s)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      // Skip events fired while the guest validation above is still running
      if (!checkingRef.current) setSession(s)
    })
    return () => subscription.unsubscribe()
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
