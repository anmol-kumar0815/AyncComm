import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** False when .env.local is missing; App shows a setup screen instead of failing on every request. */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(
  url || 'https://placeholder-project.supabase.co',
  anonKey || 'placeholder-key',
  {
    // Messages arrive in bursts; keep the realtime client from throttling them.
    realtime: { params: { eventsPerSecond: 20 } },
  },
)
