import { useState } from 'react'
import { Lock } from 'lucide-react'
import { Button } from '../ui/button'
import { Spinner } from '../ui/spinner'
import { AuthShell, FormError } from './AuthShell'
import { PasswordField } from './PasswordField'
import { signOut } from '../../lib/api/auth'

/** Shown instead of the app while the app lock is on and this tab hasn't been unlocked. One field, Enter to go. */
export default function LockScreen({ user, onUnlock }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onUnlock(password)
    } catch (err) {
      setError(err.message)
      setBusy(false)
      setPassword('')
    }
  }

  return (
    <AuthShell title="AsyncComm is locked" subtitle={`Enter the password for ${user.email} to continue.`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex justify-center"><Lock className="h-8 w-8 text-blue-600" aria-hidden="true" /></div>
        <PasswordField
          id="unlock-password"
          label="Password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormError>{error}</FormError>
        <Button type="submit" className="w-full" disabled={busy || !password}>
          {busy ? <Spinner className="text-white" /> : 'Unlock'}
        </Button>
        <div className="text-center text-sm">
          <button type="button" onClick={signOut} className="text-gray-500 hover:text-gray-800">Log out / use a different account</button>
        </div>
      </form>
    </AuthShell>
  )
}
