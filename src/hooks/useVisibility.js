import { useSyncExternalStore } from 'react'

const subscribe = (cb) => {
  document.addEventListener('visibilitychange', cb)
  return () => document.removeEventListener('visibilitychange', cb)
}
/** True while the tab is in the foreground (so we only mark messages read when they can actually be seen). */
export const useIsVisible = () =>
  useSyncExternalStore(subscribe, () => document.visibilityState === 'visible', () => true)
