// Development only. Browsers share localStorage between tabs (and between *all* incognito
// windows), and supabase-js keeps the login there and syncs it across tabs, so signing in as
// Alice in one tab silently logs every other tab in as Alice. For multi-user testing, tabs
// opened with `?as=` keep their session in sessionStorage instead, which is private to the tab.

const FLAG = 'asynccomm.dev.perTabSession'

/** True once this tab has been opened with `?as=...` (remembered for reloads and in-app navigation). */
export function wantsPerTabSession({ search, storage }) {
  if (new URLSearchParams(search).has('as')) {
    storage.setItem(FLAG, '1')
    return true
  }
  return storage.getItem(FLAG) === '1'
}
