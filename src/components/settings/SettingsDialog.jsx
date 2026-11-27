import { useState } from 'react'
import { Lock, LogOut } from 'lucide-react'
import { Dialog } from '../ui/dialog'
import { Avatar } from '../ui/avatar'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Spinner } from '../ui/spinner'
import { FormError } from '../auth/AuthShell'
import { PasswordField } from '../auth/PasswordField'
import { useAppLock } from '../../hooks/appLockContext'
import { signOut, updateDisplayName } from '../../lib/api/auth'
import { useToast } from '../ui/toast'

export default function SettingsDialog({ open, onClose, user, profile, onProfileChanged }) {
  const toast = useToast()
  const current = profile?.display_name || ''
  const [name, setName] = useState(current)
  const [busy, setBusy] = useState(false)
  const dirty = name.trim() !== current && name.trim().length > 0

  // "Ask for my password when I open the app": turning it on or off needs the password.
  const lock = useAppLock()
  const [confirming, setConfirming] = useState(null) // null | 'enable' | 'disable'
  const [lockPassword, setLockPassword] = useState('')
  const [lockError, setLockError] = useState('')
  const [lockBusy, setLockBusy] = useState(false)
  const closeLockForm = () => { setConfirming(null); setLockPassword(''); setLockError('') }
  const submitLock = async (e) => {
    e.preventDefault()
    setLockBusy(true)
    setLockError('')
    try {
      await (confirming === 'enable' ? lock.enable(lockPassword) : lock.disable(lockPassword))
      toast.show(confirming === 'enable' ? 'App lock is on for this device.' : 'App lock is off.', 'success')
      closeLockForm()
    } catch (err) {
      setLockError(err.message)
    } finally {
      setLockBusy(false)
    }
  }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await updateDisplayName(user.id, name.trim())
      await onProfileChanged()
      toast.show('Name updated.', 'success')
    } catch (err) {
      toast.show(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Settings">
      <div className="flex items-center gap-3 pb-4">
        <Avatar name={current || user.email} seed={user.email} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{current || 'No name yet'}</p>
          <p className="truncate text-sm text-gray-500">{user.email}</p>
        </div>
      </div>
      <form onSubmit={save} className="space-y-3">
        <div>
          <label htmlFor="display-name" className="mb-1.5 block text-sm font-medium text-gray-700">Your name</label>
          <Input id="display-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          <p className="mt-1.5 text-xs text-gray-500">This is what your friends see.</p>
        </div>
        <Button type="submit" variant="secondary" className="w-full" disabled={!dirty || busy}>
          {busy ? <Spinner /> : 'Save name'}
        </Button>
      </form>
      <hr className="my-5" />

      <section aria-labelledby="security-heading">
        <h3 id="security-heading" className="mb-2 text-sm font-semibold text-gray-900">Security</h3>
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p id="lock-label" className="text-[15px] font-medium text-gray-900">Ask for my password when I open the app</p>
            <p className="text-xs text-gray-500">On this device only. Closing the tab locks the app until you type your password.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={lock.enabled}
            aria-labelledby="lock-label"
            onClick={() => (confirming ? closeLockForm() : setConfirming(lock.enabled ? 'disable' : 'enable'))}
            className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${lock.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
          >
            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${lock.enabled ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {confirming && (
          <form onSubmit={submitLock} className="mt-3 space-y-3 rounded-xl bg-gray-50 p-3">
            <PasswordField
              id="lock-password"
              label={confirming === 'enable' ? 'Enter your password to turn the lock on' : 'Enter your password to turn the lock off'}
              autoComplete="current-password"
              autoFocus
              value={lockPassword}
              onChange={(e) => setLockPassword(e.target.value)}
            />
            <FormError>{lockError}</FormError>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={closeLockForm}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={lockBusy || !lockPassword}>
                {lockBusy ? <Spinner className="text-white" /> : confirming === 'enable' ? 'Turn on' : 'Turn off'}
              </Button>
            </div>
          </form>
        )}
      </section>

      <hr className="my-5" />
      <Button variant="outline" className="w-full text-red-600 hover:text-red-700" onClick={signOut}>
        <LogOut className="h-4 w-4" /> Log out
      </Button>
      <p className="mt-4 text-center text-xs text-gray-400">
        AsyncComm{import.meta.env.DEV ? ' · dev build' : ''}
      </p>
    </Dialog>
  )
}
