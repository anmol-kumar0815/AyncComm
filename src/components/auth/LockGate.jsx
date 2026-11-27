import { useState } from 'react'
import LockScreen from './LockScreen'
import { AppLockContext } from '../../hooks/appLockContext'
import { signInWithPassword } from '../../lib/api/auth'
import { isLockEnabled, isUnlocked, markUnlocked, setLockEnabled } from '../../lib/appLock'

/**
 * Wraps the signed-in app. While the lock is on for this user on this device and this tab hasn't been
 * unlocked, it renders the lock screen INSTEAD of its children, so nothing behind it loads (no chats,
 * no realtime connection, no "online" status). Also provides the setting to the Settings dialog.
 */
export default function LockGate({ user, children }) {
  const [enabled, setEnabled] = useState(() => isLockEnabled(user.id))
  const [unlocked, setUnlocked] = useState(() => isUnlocked(user.id))

  // Checking a password = signing in again with it (the server is the only judge). Throws a readable Error.
  const verify = (password) => signInWithPassword(user.email, password)

  const unlock = async (password) => {
    await verify(password)
    markUnlocked(user.id)
    setUnlocked(true)
  }

  // Turning it on or off asks for the password too: otherwise anyone at an unlocked device could switch it
  // off, and someone who never knew their password could lock themselves out.
  const enable = async (password) => {
    await verify(password)
    setLockEnabled(user.id, true)
    markUnlocked(user.id) // they just proved it; don't lock them out of the tab they're using
    setEnabled(true)
    setUnlocked(true)
  }
  const disable = async (password) => {
    await verify(password)
    setLockEnabled(user.id, false)
    setEnabled(false)
  }

  if (enabled && !unlocked) return <LockScreen user={user} onUnlock={unlock} />
  return <AppLockContext.Provider value={{ enabled, enable, disable }}>{children}</AppLockContext.Provider>
}
