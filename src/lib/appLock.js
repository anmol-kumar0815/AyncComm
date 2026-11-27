// "Ask for my password when I open the app" (optional, per device).
//
//  - the setting lives in localStorage, per user, so it belongs to this browser/device
//  - "unlocked" lives in sessionStorage, so it ends when the tab closes (a reload keeps it)
//
// This is a gate in the UI: the login session itself is still stored by the browser, so it
// keeps casual access out (someone opening your laptop's browser), not a determined attacker
// with developer tools. Storage can be unavailable (some private modes); then the lock simply
// can't persist and the app behaves as if it were off.

const ENABLED_PREFIX = 'asynccomm.appLock.'
const UNLOCKED_KEY = 'asynccomm.unlockedFor'

const attempt = (fn, fallback) => {
  try { return fn() } catch { return fallback }
}

export const isLockEnabled = (userId) => attempt(() => globalThis.localStorage.getItem(ENABLED_PREFIX + userId) === '1', false)

export function setLockEnabled(userId, on) {
  attempt(() => (on
    ? globalThis.localStorage.setItem(ENABLED_PREFIX + userId, '1')
    : globalThis.localStorage.removeItem(ENABLED_PREFIX + userId)))
}

/** Remember, for this tab only, that this user has typed their password. */
export const markUnlocked = (userId) => attempt(() => globalThis.sessionStorage.setItem(UNLOCKED_KEY, userId))
export const isUnlocked = (userId) => attempt(() => globalThis.sessionStorage.getItem(UNLOCKED_KEY) === userId, false)
export const clearUnlocked = () => attempt(() => globalThis.sessionStorage.removeItem(UNLOCKED_KEY))

/** Must the user type their password before this tab can show the app? */
export const needsUnlock = (userId) => isLockEnabled(userId) && !isUnlocked(userId)
