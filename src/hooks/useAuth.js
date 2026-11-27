import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchProfile } from '../lib/api/auth'

/**
 * status:
 *  loading      - restoring the stored session (and dev auto-login)
 *  signedOut    - show the sign-in screen
 *  profileError - signed in but the profile couldn't be loaded (retry / sign out)
 *  ready        - show the app
 */
export function useAuth() {
  const [booted, setBooted] = useState(false)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileState, setProfileState] = useState('idle') // idle | loading | ready | error
  const userId = session?.user?.id ?? null

  // 1. Restore the stored session, then
  //    let the dev shortcut sign in if there is none.
  useEffect(() => {
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      // Keep this callback synchronous: awaiting supabase calls in here can deadlock the client.
      if (event === 'SIGNED_OUT') { setProfile(null); setProfileState('idle') }
      setSession(next)
    })
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) setSession(data.session)
      // Dev-only shortcut. The literal `import.meta.env.DEV` lets the bundler delete this
      // branch (and the dev module with its seeded credentials) from production builds.
      if (import.meta.env.DEV) {
        const { maybeDevLogin } = await import('../lib/devLogin')
        await maybeDevLogin(data.session)
      }
      if (active) setBooted(true)
    })()
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  // 2. Load the profile whenever the signed-in user changes.
  const loadProfile = useCallback(async (id) => {
    setProfileState('loading')
    try {
      setProfile(await fetchProfile(id))
      setProfileState('ready')
    } catch (e) {
      console.error(e)
      setProfileState('error')
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    loadProfile(userId) // eslint-disable-line react-hooks/set-state-in-effect -- fetching external data on user change
  }, [userId, loadProfile])

  // Re-read the profile without going back to the loading screen (used after renaming yourself).
  const refreshProfile = useCallback(async () => {
    if (userId) setProfile(await fetchProfile(userId))
  }, [userId])

  let status
  if (!booted) status = 'loading'
  else if (!session) status = 'signedOut'
  else if (profileState === 'idle' || profileState === 'loading') status = 'loading'
  else if (profileState === 'error') status = 'profileError'
  else status = 'ready'

  return {
    status,
    session,
    user: session?.user ?? null,
    profile,
    refreshProfile,
    retryProfile: () => userId && loadProfile(userId),
  }
}
