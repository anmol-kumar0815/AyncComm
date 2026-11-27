// Development-only shortcut: sign in as a seeded user so you never have to go
// through email links while building. Everything here is gated on
// import.meta.env.DEV, which Vite replaces with `false` in production builds,
// so this code (and the seeded credentials) is stripped from the shipped bundle.
import { supabase } from './supabase'

const DEV_PASSWORD = 'password123' // seeded by seed.sql, example.com users only
const DEV_USERS = {
  dev: 'dev_user@example.com',
  alice: 'alice@example.com',
  bob: 'bob@example.com',
}
const OPT_OUT_KEY = 'asynccomm.devAutoLogin.off'

export const isDevLoginEnabled = () =>
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTO_LOGIN !== 'false'

/** The `?as=alice|bob|dev|none` query param, if any. */
function requestedUser() {
  const as = new URLSearchParams(window.location.search).get('as')
  return as ? as.toLowerCase() : null
}

/**
 * Call once at startup with the current session (or null). Signs in as the dev
 * user when there is no session, or as another seeded user when `?as=` asks.
 * Returns true if it changed the session.
 */
export async function maybeDevLogin(session) {
  if (!isDevLoginEnabled()) return false
  const as = requestedUser()
  if (as === 'none') return false

  const wanted = DEV_USERS[as] // undefined when no (or an unknown) ?as=
  if (session) {
    if (!wanted || session.user.email === wanted) return false
    await supabase.auth.signOut() // ?as=bob while logged in as someone else: switch
  } else if (!wanted && sessionStorage.getItem(OPT_OUT_KEY)) {
    return false // you logged out on purpose in this tab; don't fight it
  }

  const email = wanted ?? DEV_USERS.dev
  const { error } = await supabase.auth.signInWithPassword({ email, password: DEV_PASSWORD })
  if (error) {
    console.warn(
      `[dev login] Couldn't sign in as ${email}: ${error.message}\n` +
        'Did you run migrations/ and seed.sql in the Supabase SQL editor? (see migrations/README.md)',
    )
    return false
  }
  sessionStorage.removeItem(OPT_OUT_KEY)
  return true
}

/** Dev-only: after a manual log out, stay logged out for the rest of this tab session. */
export function rememberDevLogout() {
  if (import.meta.env.DEV) sessionStorage.setItem(OPT_OUT_KEY, '1')
}

/**
 * Dev-only: skip the email step for brand-new addresses by creating the account
 * directly. Works when "Confirm email" is OFF in Supabase (Auth -> Providers ->
 * Email); otherwise returns false and the caller falls back to the magic link.
 */
export async function devSignUpWithoutEmail(email) {
  if (!isDevLoginEnabled() || import.meta.env.VITE_DEV_SKIP_EMAIL === 'false') return false
  const { data, error } = await supabase.auth.signUp({ email, password: crypto.randomUUID() })
  if (error) {
    console.warn('[dev login] signUp failed, falling back to magic link:', error.message)
    return false
  }
  return Boolean(data.session)
}
