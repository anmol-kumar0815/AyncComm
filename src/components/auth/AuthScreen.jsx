import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Spinner } from '../ui/spinner'
import { AuthShell, FormError } from './AuthShell'
import { PasswordField } from './PasswordField'
import { emailHasPassword, signInWithPassword, signUpWithPassword } from '../../lib/api/auth'

export const MIN_PASSWORD_LENGTH = 8

/**
 * Email + password, nothing else (the app sends no emails):
 *   email -> (has an account?) -> password            "Welcome back"
 *         -> (new here)        -> name + password     "Create your account"
 * Either way the session starts immediately and the app takes over.
 */
export default function AuthScreen() {
  const [step, setStep] = useState('email') // email | password | signup
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const passwordRef = useRef(null)
  const nameRef = useRef(null)

  // Move the cursor to the first field of the new step (autoFocus is unreliable across step changes).
  useEffect(() => {
    if (step === 'password') passwordRef.current?.focus()
    if (step === 'signup') nameRef.current?.focus()
  }, [step])

  const run = async (fn) => {
    setBusy(true)
    setError('')
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const onEmailSubmit = (e) => {
    e.preventDefault()
    const clean = email.trim().toLowerCase()
    setEmail(clean)
    run(async () => setStep((await emailHasPassword(clean)) ? 'password' : 'signup'))
  }

  const onPasswordSubmit = (e) => {
    e.preventDefault()
    run(() => signInWithPassword(email, password))
  }

  const onSignupSubmit = (e) => {
    e.preventDefault()
    const cleanName = name.trim()
    if (!cleanName) return setError('Please enter your name.')
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`)
    run(() => signUpWithPassword({ email, password, name: cleanName }))
  }

  const goBack = () => {
    setStep('email')
    setPassword('')
    setError('')
  }

  if (step === 'password') {
    return (
      <AuthShell title="Welcome back" subtitle={email}>
        <form onSubmit={onPasswordSubmit} className="space-y-4">
          <PasswordField
            id="password"
            label="Password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            ref={passwordRef}
          />
          <FormError>{error}</FormError>
          <Button type="submit" className="w-full" disabled={busy || !password}>
            {busy ? <Spinner className="text-white" /> : 'Sign in'}
          </Button>
          <div className="space-y-2 text-center text-sm">
            <button type="button" onClick={goBack} className="text-gray-500 hover:text-gray-800">Not you?</button>
            <p className="text-xs text-gray-500">Forgot your password? Ask the person who runs this app to reset it.</p>
          </div>
        </form>
      </AuthShell>
    )
  }

  if (step === 'signup') {
    return (
      <AuthShell title="Create your account" subtitle={`New here? Choose your name and a password for ${email}.`}>
        <form onSubmit={onSignupSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-gray-700">Your name</label>
            <Input
              id="name"
              ref={nameRef}
              autoComplete="name"
              maxLength={60}
              placeholder="e.g. Alice Johnson"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <PasswordField
            id="new-password"
            label="Password"
            autoComplete="new-password"
            hint={`At least ${MIN_PASSWORD_LENGTH} characters. There is no email reset, so choose one you'll remember.`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FormError>{error}</FormError>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Spinner className="text-white" /> : 'Create account'}
          </Button>
          <div className="text-center text-sm">
            <button type="button" onClick={goBack} className="text-gray-500 hover:text-gray-800">Use a different email</button>
          </div>
        </form>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Welcome to AsyncComm"
      subtitle="Enter your email to sign in or create an account."
      footer={import.meta.env.DEV ? 'Dev mode: you are normally signed in automatically. Use /?as=none to see this screen.' : null}
    >
      <form onSubmit={onEmailSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <FormError>{error}</FormError>
        <Button type="submit" className="w-full" disabled={busy || !email.trim()}>
          {busy ? <Spinner className="text-white" /> : 'Continue'}
        </Button>
      </form>
    </AuthShell>
  )
}
