// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../src/lib/api/auth', () => ({
  emailHasPassword: vi.fn(),
  signInWithPassword: vi.fn(),
  sendMagicLink: vi.fn(),
  sendPasswordReset: vi.fn(),
  completeAccount: vi.fn(),
  signOut: vi.fn(),
}))
// vitest runs with import.meta.env.DEV = true, so the dev-only branch is live here.
vi.mock('../src/lib/devLogin', () => ({ devSignUpWithoutEmail: vi.fn(async () => false) }))

import AuthScreen from '../src/components/auth/AuthScreen.jsx'
import { emailHasPassword, sendMagicLink, sendPasswordReset, signInWithPassword } from '../src/lib/api/auth'
import { devSignUpWithoutEmail } from '../src/lib/devLogin'

let user
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(<AuthScreen />)
})
afterEach(() => vi.useRealTimers())

const enterEmail = async (email) => {
  await user.type(screen.getByLabelText('Email'), email)
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

describe('returning user (has a password)', () => {
  beforeEach(() => emailHasPassword.mockResolvedValue(true))

  it('goes email -> password and signs in with the normalised email', async () => {
    await enterEmail('  Alice@Example.COM ')
    expect(emailHasPassword).toHaveBeenCalledWith('alice@example.com')
    expect(await screen.findByText('Welcome back')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()

    const pw = screen.getByLabelText('Password')
    expect(pw).toHaveFocus() // no extra click to start typing
    await user.type(pw, 'hunter22{Enter}')
    expect(signInWithPassword).toHaveBeenCalledWith('alice@example.com', 'hunter22')
    expect(sendMagicLink).not.toHaveBeenCalled() // never emails a returning user unprompted
  })

  it('shows a wrong-password error in place and lets them retry', async () => {
    signInWithPassword.mockRejectedValueOnce(new Error("That email and password don't match."))
    await enterEmail('a@b.co')
    await user.type(await screen.findByLabelText('Password'), 'wrong{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent("don't match")
    expect(screen.getByLabelText('Password')).toBeInTheDocument() // still on the password step
  })

  it('has a show/hide toggle for the password', async () => {
    await enterEmail('a@b.co')
    const pw = await screen.findByLabelText('Password')
    expect(pw).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(pw).toHaveAttribute('type', 'text')
  })

  it('"Not you?" returns to the email step', async () => {
    await enterEmail('a@b.co')
    await user.click(await screen.findByRole('button', { name: 'Not you?' }))
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('"Forgot password?" sends a reset link and says so', async () => {
    await enterEmail('a@b.co')
    await user.click(await screen.findByRole('button', { name: 'Forgot password?' }))
    expect(sendPasswordReset).toHaveBeenCalledWith('a@b.co')
    expect(await screen.findByText('Check your email')).toBeInTheDocument()
    expect(screen.getByText(/choose a new password/i)).toBeInTheDocument()
  })
})

describe('first-time user', () => {
  beforeEach(() => emailHasPassword.mockResolvedValue(false))

  it('sends a magic link and confirms where it went', async () => {
    await enterEmail('New@Example.com')
    expect(sendMagicLink).toHaveBeenCalledWith('new@example.com')
    expect(await screen.findByText('Check your email')).toBeInTheDocument()
    expect(screen.getByText('new@example.com')).toBeInTheDocument()
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('throttles "Resend" with a visible countdown, then allows it', async () => {
    await enterEmail('n@e.co')
    const resend = await screen.findByRole('button', { name: /Resend link in 30s/ })
    expect(resend).toBeDisabled()
    // tick second by second so React flushes each countdown update, like a real clock
    for (let i = 0; i < 30; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    const ready = screen.getByRole('button', { name: 'Resend link' })
    expect(ready).toBeEnabled()
    await user.click(ready)
    expect(sendMagicLink).toHaveBeenCalledTimes(2)
  })

  it('lets them fix a typo in the email', async () => {
    await enterEmail('typo@e.co')
    await user.click(await screen.findByRole('button', { name: 'Use a different email' }))
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('in dev, skips the email step when direct sign-up works', async () => {
    devSignUpWithoutEmail.mockResolvedValueOnce(true)
    await enterEmail('dev@e.co')
    expect(devSignUpWithoutEmail).toHaveBeenCalledWith('dev@e.co')
    expect(sendMagicLink).not.toHaveBeenCalled()
  })

  it('in dev, falls back to the magic link when direct sign-up is unavailable', async () => {
    await enterEmail('dev@e.co') // mock returns false
    expect(sendMagicLink).toHaveBeenCalledWith('dev@e.co')
  })
})

describe('errors', () => {
  it('keeps the email and shows the problem if the lookup fails', async () => {
    emailHasPassword.mockRejectedValueOnce(new Error("Can't reach the server. Check your connection and try again."))
    await enterEmail('a@b.co')
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
    expect(screen.getByLabelText('Email')).toHaveValue('a@b.co')
  })

  it('shows rate-limit errors from sending the link', async () => {
    emailHasPassword.mockResolvedValue(false)
    sendMagicLink.mockRejectedValueOnce(new Error('Too many attempts. Please wait a minute and try again.'))
    await enterEmail('a@b.co')
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
  })

  it('disables Continue until something is typed', () => {
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })
})
