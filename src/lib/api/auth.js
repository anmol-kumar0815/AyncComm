import { supabase } from '../supabase'
import { friendlyError } from './errors'

/** Does this email already have a password? false means "new here": show the create-account form. */
export async function emailHasPassword(email) {
  const { data, error } = await supabase.rpc('email_has_password', { p_email: email })
  if (error) throw new Error(friendlyError(error))
  return Boolean(data)
}

export async function signInWithPassword(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(friendlyError(error))
}

/**
 * Create an account with a password. No email is involved: this relies on "Confirm email" being OFF
 * in Supabase, so signUp returns a session straight away and the app carries on by itself.
 * (The display name travels in user metadata; the database trigger copies it into the profile.)
 */
export async function signUpWithPassword({ email, password, name }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: name } },
  })
  if (error) throw new Error(friendlyError(error))
  if (!data.session) {
    throw new Error(
      'Your account was created, but this project still asks for email confirmation. ' +
        'Ask the person who runs the app to turn off "Confirm email" in Supabase, then sign in.',
    )
  }
}

export async function signOut() {
  // dev only: don't auto-login again straight after an intentional log out
  if (import.meta.env.DEV) (await import('../devLogin')).rememberDevLogout()
  await supabase.auth.signOut()
}

export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name')
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
