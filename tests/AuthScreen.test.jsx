// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../src/lib/api/auth', () => ({
  emailHasPassword: vi.fn(),
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
}))

import AuthScreen from '../src/components/auth/AuthScreen.jsx'
import { emailHasPassword, signInWithPassword, signUpWithPassword } from '../src/lib/api/auth'

let user
beforeEach(() => {
  vi.clearAllMocks()
  user = userEvent.setup()
  render(<AuthScreen />)
})

const enterEmail = async (email) => {
  await user.type(screen.getByLabelText('Email'), email)
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

describe('returning user', () => {
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
    expect(signUpWithPassword).not.toHaveBeenCalled()
  })

  it('shows a wrong-password error in place and lets them retry', async () => {
    signInWithPassword.mockRejectedValueOnce(new Error("That email and password don't match."))
    await enterEmail('a@b.co')
    await user.type(await screen.findByLabelText('Password'), 'wrong{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent("don't match")
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
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

  it('has no email-based recovery: it says to ask the admin instead', async () => {
    await enterEmail('a@b.co')
    expect(await screen.findByText(/Ask the person who runs this app to reset it/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Forgot password/i })).not.toBeInTheDocument()
  })
})

describe('new user', () => {
  beforeEach(() => emailHasPassword.mockResolvedValue(false))

  it('is taken straight to creating an account, with no email involved', async () => {
    await enterEmail('New@Example.com')
    expect(await screen.findByText('Create your account')).toBeInTheDocument()
    expect(screen.getByText(/new@example.com/)).toBeInTheDocument()
    expect(screen.getByLabelText('Your name')).toHaveFocus()
    expect(screen.queryByText(/Check your email/)).not.toBeInTheDocument()
  })

  it('creates the account with the normalised email, trimmed name and the password', async () => {
    signUpWithPassword.mockResolvedValue()
    await enterEmail('  New@Example.com ')
    await user.type(await screen.findByLabelText('Your name'), '  Alice Johnson ')
    await user.type(screen.getByLabelText('Password'), 'correct-horse{Enter}')
    expect(signUpWithPassword).toHaveBeenCalledWith({ email: 'new@example.com', password: 'correct-horse', name: 'Alice Johnson' })
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('does not submit with a missing name or a short password, and says why', async () => {
    await enterEmail('n@e.co')
    await user.type(await screen.findByLabelText('Password'), 'longenough{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('enter your name')

    await user.type(screen.getByLabelText('Your name'), 'Al')
    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), 'short{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('at least 8 characters')
    expect(signUpWithPassword).not.toHaveBeenCalled()
  })

  it('keeps what was typed and shows the problem if sign-up fails', async () => {
    signUpWithPassword.mockRejectedValueOnce(new Error('Choose a stronger password (at least 8 characters).'))
    await enterEmail('n@e.co')
    await user.type(await screen.findByLabelText('Your name'), 'Al')
    await user.type(screen.getByLabelText('Password'), 'password1{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('stronger password')
    expect(screen.getByLabelText('Your name')).toHaveValue('Al')
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
  })

  it('warns that there is no email reset, so the password must be memorable', async () => {
    await enterEmail('n@e.co')
    expect(await screen.findByText(/no email reset/i)).toBeInTheDocument()
  })

  it('lets them fix a typo in the email', async () => {
    await enterEmail('typo@e.co')
    await user.click(await screen.findByRole('button', { name: 'Use a different email' }))
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })
})

describe('errors', () => {
  it('keeps the email and shows the problem if the lookup fails', async () => {
    emailHasPassword.mockRejectedValueOnce(new Error("Can't reach the server. Check your connection and try again."))
    await enterEmail('a@b.co')
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
    expect(screen.getByLabelText('Email')).toHaveValue('a@b.co')
  })

  it('disables Continue until something is typed', () => {
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })
})
