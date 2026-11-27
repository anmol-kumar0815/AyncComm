/** Turn a Supabase/Postgrest/Auth/network error into something a person can act on. */
export function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback
  const msg = String(error.message || '')
  const code = error.code || error.error_code || ''

  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return "That email and password don't match."
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || /rate limit|too many/i.test(msg)) {
    return 'Too many attempts. Please wait a minute and try again.'
  }
  if (code === 'weak_password') return 'Choose a stronger password (at least 8 characters).'
  if (code === 'email_not_confirmed') return 'Please confirm your email using the link we sent you.'
  if (code === 'user_banned') return 'This account has been disabled.'
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return "Can't reach the server. Check your connection and try again."
  }
  if (code === '42501' || code === 'PGRST301' || /jwt|not authenticated/i.test(msg)) return 'Your session has expired. Please sign in again.'
  return fallback
}

export const isSamePasswordError = (e) => e?.code === 'same_password' || /different from the old password/i.test(e?.message || '')

/** Error carrying the original Postgres/Auth `code` (so callers can special-case e.g. 23505). */
export function apiError(error, fallback) {
  const e = new Error(friendlyError(error, fallback))
  e.code = error?.code
  return e
}
