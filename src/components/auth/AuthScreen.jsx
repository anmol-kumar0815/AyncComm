import { useEffect, useRef, useState } from 'react'
import { Mail } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Spinner } from '../ui/spinner'
import { AuthShell, FormError } from './AuthShell'
import { PasswordField } from './PasswordField'
import { emailHasPassword, sendMagicLink, sendPasswordReset, signInWithPassword } from '../../lib/api/auth'

// Supabase allows one auth email per address every 60s by default; unlocking sooner just gets rejected.
const RESEND_SECONDS = 60

/**
 * Sign-in in as few steps as possible:
 *   email -> (already has a password?) -> password            [returning user: 2 fields, 2 submits]
 *         -> (new)                      -> "check your email" [first time: 1 field, link in inbox]
 * Signing in with a link then lands on the set-password screen (SetupScreen).
 */
export default function AuthScreen() {
  const [step, setStep] = useState('email') // email | password | sent
  const [sentKind, setSentKind] = useState('signup') // signup | reset
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const passwordRef = useRef(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  useEffect(() => {
    if (step === 'password') passwordRef.current?.focus()
  }, [step])

  const run = async (fn) => {
    setBusy(true)
    setError('')
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  // `to` is explicit because right after submit, the `email` state still holds the un-normalised input.
  const sendLink = async (kind, to = email) => {
    if (kind === 'reset') await sendPasswordReset(to)
    else await sendMagicLink(to)
    setSentKind(kind)
    setCooldown(RESEND_SECONDS)
    setStep('sent')
  }

  const onEmailSubmit = (e) => {
    e.preventDefault()
    const clean = email.trim().toLowerCase()
    setEmail(clean)
    run(async () => {
      if (await emailHasPassword(clean)) {
        setStep('password')
      } else {
        // Dev only: skip the email step by creating the account directly (see lib/devLogin.js).
        // On success we're signed in and the app moves on by itself.
        if (import.meta.env.DEV && (await (await import('../../lib/devLogin')).devSignUpWithoutEmail(clean))) return
        await sendLink('signup', clean)
      }
    })
  }

  const onPasswordSubmit = (e) => {
    e.preventDefault()
    run(() => signInWithPassword(email, password))
  }

  const goBack = () => {
    setStep('email')
    setPassword('')
    setError('')
  }

  if (step === 'sent') {
    return (
      <AuthShell
        title="Check your email"
        subtitle={
          sentKind === 'reset'
            ? <>We sent a link to <strong className="font-medium text-gray-700">{email}</strong>. Open it to choose a new password.</>
            : <>We sent a sign-in link to <strong className="font-medium text-gray-700">{email}</strong>. Open it on this device to continue.</>
        }
      >
        <div className="space-y-3">
          <div className="flex justify-center py-2"><Mail className="h-10 w-10 text-blue-600" aria-hidden="true" /></div>
          <FormError>{error}</FormError>
          <Button
            variant="outline"
            className="w-full"
            disabled={busy || cooldown > 0}
            onClick={() => run(() => sendLink(sentKind))}
          >
            {busy ? <Spinner className="text-gray-500" /> : cooldown > 0 ? `Resend link in ${cooldown}s` : 'Resend link'}
          </Button>
          <Button variant="ghost" className="w-full" onClick={goBack}>Use a different email</Button>
          <p className="text-center text-xs text-gray-500">Can't find it? Check your spam folder.</p>
        </div>
      </AuthShell>
    )
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
          <div className="flex items-center justify-between text-sm">
            <button type="button" onClick={goBack} className="text-gray-500 hover:text-gray-800">Not you?</button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => sendLink('reset'))}
              className="font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              Forgot password?
            </button>
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
