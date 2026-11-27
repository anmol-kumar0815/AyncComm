import { supabase } from '../supabase'
import { friendlyError, isSamePasswordError } from './errors'

const redirectTo = () => window.location.origin

/** Does this email already have a password? (false for brand-new emails) */
export async function emailHasPassword(email) {
  const { data, error } = await supabase.rpc('email_has_password', { p_email: email })
  if (error) throw new Error(friendlyError(error))
  return Boolean(data)
}

export async function signInWithPassword(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(friendlyError(error))
}

/** Emails a sign-in link; creates the account on first use. */
export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo(), shouldCreateUser: true },
  })
  if (error) throw new Error(friendlyError(error))
}

/** "Forgot password": the emailed link signs the user in and fires PASSWORD_RECOVERY. */
export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() })
  if (error) throw new Error(friendlyError(error))
}

/**
 * First-time setup (or reset): store the password and display name, then flag
 * the profile so the next visit asks for the password instead of this screen.
 */
export async function completeAccount({ userId, password, name }) {
  const attrs = { password }
  if (name) attrs.data = { display_name: name }
  const { error: authError } = await supabase.auth.updateUser(attrs)
  // Retrying after a half-finished attempt re-sends the same password; that's fine.
  if (authError && !isSamePasswordError(authError)) throw new Error(friendlyError(authError))

  const patch = { has_password: true }
  if (name) patch.display_name = name
  const { error: dbError } = await supabase.from('profiles').update(patch).eq('id', userId)
  if (dbError) throw new Error(friendlyError(dbError, "Your password was saved but we couldn't finish setting up. Please try again."))
}

export async function signOut() {
  // dev only: don't auto-login again straight after an intentional log out
  if (import.meta.env.DEV) (await import('../devLogin')).rememberDevLogout()
  await supabase.auth.signOut()
}

export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, has_password')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(friendlyError(error))
  return data
}

export async function updateDisplayName(userId, name) {
  const { error } = await supabase.from('profiles').update({ display_name: name }).eq('id', userId)
  if (error) throw new Error(friendlyError(error))
  await supabase.auth.updateUser({ data: { display_name: name } })
}
