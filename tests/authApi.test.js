// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { auth, rpc } = vi.hoisted(() => ({ auth: { signUp: vi.fn(), signInWithPassword: vi.fn() }, rpc: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ supabase: { auth, rpc } }))
import { emailHasPassword, signInWithPassword, signUpWithPassword } from '../src/lib/api/auth.js'

beforeEach(() => vi.clearAllMocks())

describe('signUpWithPassword', () => {
  it('creates the account with a password and sends the name as metadata (the database copies it to the profile)', async () => {
    auth.signUp.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null })
    await signUpWithPassword({ email: 'a@b.co', password: 'pw-12345', name: 'Alice' })
    expect(auth.signUp).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw-12345', options: { data: { display_name: 'Alice' } } })
  })

  it('never asks Supabase to send an email (no redirect / OTP options)', async () => {
    auth.signUp.mockResolvedValue({ data: { session: {} }, error: null })
    await signUpWithPassword({ email: 'a@b.co', password: 'pw-12345', name: 'Alice' })
    const arg = auth.signUp.mock.calls[0][0]
    expect(arg.options).not.toHaveProperty('emailRedirectTo')
  })

  it('explains the fix when the project still requires email confirmation (no session came back)', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: { id: 'u' } }, error: null })
    await expect(signUpWithPassword({ email: 'a@b.co', password: 'pw-12345', name: 'A' })).rejects.toThrow(/turn off "Confirm email"/)
  })

  it('turns an "already registered" failure into plain language', async () => {
    auth.signUp.mockResolvedValue({ data: {}, error: { code: 'user_already_exists', message: 'User already registered' } })
    await expect(signUpWithPassword({ email: 'a@b.co', password: 'pw-12345', name: 'A' })).rejects.toThrow(/already exists/)
  })

  it('turns a weak-password failure into plain language', async () => {
    auth.signUp.mockResolvedValue({ data: {}, error: { code: 'weak_password', message: 'Password should be at least 6 characters' } })
    await expect(signUpWithPassword({ email: 'a@b.co', password: 'x', name: 'A' })).rejects.toThrow(/stronger password/)
  })
})

describe('signInWithPassword / emailHasPassword', () => {
  it('maps wrong credentials to a friendly message', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', message: 'Invalid login credentials' } })
    await expect(signInWithPassword('a@b.co', 'bad')).rejects.toThrow("That email and password don't match.")
  })
  it('asks the server whether the email already has a password', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    expect(await emailHasPassword('a@b.co')).toBe(true)
    expect(rpc).toHaveBeenCalledWith('email_has_password', { p_email: 'a@b.co' })
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await emailHasPassword('new@b.co')).toBe(false)
  })
})
