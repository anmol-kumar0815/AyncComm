import { useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Spinner } from '../ui/spinner'
import { AuthShell, FormError } from './AuthShell'
import { PasswordField } from './PasswordField'
import { completeAccount, signOut } from '../../lib/api/auth'

export const MIN_PASSWORD_LENGTH = 8

/**
 * Shown once after the first email link (choose name + password) and after a
 * "forgot password" link (choose a new password; the name is already known).
 */
export default function SetupScreen({ user, profile, isRecovery, onDone }) {
  const hasName = isRecovery && Boolean(profile?.display_name)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    const cleanName = name.trim()
    if (!hasName && !cleanName) return setError('Please enter your name.')
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`)
    setBusy(true)
    setError('')
    try {
      await completeAccount({ userId: user.id, password, name: hasName ? null : cleanName })
      await onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={isRecovery ? 'Choose a new password' : 'Almost there'}
      subtitle={
        isRecovery
          ? 'Pick a password you will remember.'
          : `Your email ${user.email} is verified. Add your name and a password: you'll use it to sign in next time.`
      }
      footer={<button type="button" onClick={signOut} className="hover:text-gray-800">Use a different email</button>}
    >
      <form onSubmit={submit} className="space-y-4">
        {!hasName && (
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-gray-700">Your name</label>
            <Input
              id="name"
              autoComplete="name"
              autoFocus
              maxLength={60}
              placeholder="e.g. Alice Johnson"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}
        <PasswordField
          id="new-password"
          label="Password"
          autoComplete="new-password"
          autoFocus={hasName}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormError>{error}</FormError>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Spinner className="text-white" /> : 'Continue'}
        </Button>
      </form>
    </AuthShell>
  )
}
