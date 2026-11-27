/** Turn a Supabase/Postgrest/Auth/network error into something a person can act on. */
export function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback
  const msg = String(error.message || '')

  // codes raised by the database functions (migration 004)
  if (/edit_window_passed/.test(msg)) return 'You can only edit a message within 15 minutes of sending it.'
  if (/not_editable/.test(msg)) return "This message can't be edited."
  if (/message_not_found/.test(msg)) return 'That message no longer exists.'
  if (/invalid_content/.test(msg)) return 'A message must be between 1 and 4000 characters.'
  const code = error.code || error.error_code || ''

  if (code === 'signup_disabled' || /signups? not allowed/i.test(msg)) {
    return 'This app is invite-only. Ask the person who runs it to create your account.'
  }
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(msg)) {
    return 'An account with this email already exists. Go back and sign in instead.'
  }
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
  // Unknown problem: say what the server said, so it can be diagnosed instead of guessed at.
  return withDetail(fallback, code, msg)
}

function withDetail(fallback, code, msg) {
  const detail = [code, msg].filter(Boolean).join(': ').slice(0, 200)
  return detail ? `${fallback} (${detail})` : fallback
}


/** Error carrying the original Postgres/Auth `code` (so callers can special-case e.g. 23505). */
export function apiError(error, fallback) {
  const e = new Error(friendlyError(error, fallback))
  e.code = error?.code
  return e
}
