import { createClient } from '@supabase/supabase-js'
import { wantsPerTabSession } from './devSession'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** False when .env.local is missing; App shows a setup screen instead of failing on every request. */
export const isSupabaseConfigured = Boolean(url && anonKey)

// Dev only (the literal DEV check lets the bundler drop this from production builds):
// give `?as=` tabs their own session so two users can be signed in side by side.
const devAuthStorage =
  import.meta.env.DEV && wantsPerTabSession({ search: window.location.search, storage: window.sessionStorage })
    ? window.sessionStorage
    : undefined

export const supabase = createClient(
  url || 'https://placeholder-project.supabase.co',
  anonKey || 'placeholder-key',
  {
    // Messages arrive in bursts; keep the realtime client from throttling them.
    realtime: { params: { eventsPerSecond: 20 } },
    ...(devAuthStorage && { auth: { storage: devAuthStorage } }),
  },
)
