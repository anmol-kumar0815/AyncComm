// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const auth = { listener: null, session: null }
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: auth.session } })),
      onAuthStateChange: vi.fn((cb) => { auth.listener = cb; return { data: { subscription: { unsubscribe: vi.fn() } } } }),
    },
  },
}))
vi.mock('../src/lib/api/auth', () => ({ fetchProfile: vi.fn() }))
vi.mock('../src/lib/devLogin', () => ({ maybeDevLogin: vi.fn(async () => false) })) // DEV is true under vitest

import { useAuth } from '../src/hooks/useAuth.js'
import { fetchProfile } from '../src/lib/api/auth'

const session = (id = 'u1') => ({ user: { id, email: `${id}@example.com` } })
const profile = (over = {}) => ({ id: 'u1', email: 'u1@example.com', display_name: 'Una', has_password: true, ...over })

beforeEach(() => { vi.clearAllMocks(); auth.session = null })

describe('useAuth status', () => {
  it('signed out when there is no stored session', async () => {
    const { result } = renderHook(() => useAuth())
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('signedOut'))
  })

  it('ready for a returning user with a password', async () => {
    auth.session = session(); fetchProfile.mockResolvedValue(profile())
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.user.id).toBe('u1')
  })

  it('needs setup after the first magic link (no password yet)', async () => {
    auth.session = session(); fetchProfile.mockResolvedValue(profile({ has_password: false }))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.status).toBe('needsSetup'))
    expect(result.current.isRecovery).toBe(false)
  })

  it('a password-recovery link forces the new-password screen even if a password exists', async () => {
    auth.session = session(); fetchProfile.mockResolvedValue(profile())
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => auth.listener('PASSWORD_RECOVERY', session()))
    expect(result.current.status).toBe('needsSetup')
    expect(result.current.isRecovery).toBe(true)

    await act(async () => { await result.current.finishSetup() })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.isRecovery).toBe(false)
  })

  it('signing in later (magic link / password) moves from signedOut to the right screen', async () => {
    fetchProfile.mockResolvedValue(profile())
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.status).toBe('signedOut'))
    act(() => auth.listener('SIGNED_IN', session()))
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  it('logging out returns to the sign-in screen and forgets the profile', async () => {
    auth.session = session(); fetchProfile.mockResolvedValue(profile())
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => auth.listener('SIGNED_OUT', null))
    expect(result.current.status).toBe('signedOut')
    expect(result.current.profile).toBeNull()
  })

  it('surfaces a profile load failure, and can recover on retry', async () => {
    auth.session = session(); fetchProfile.mockRejectedValueOnce(new Error('boom')); vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.status).toBe('profileError'))
    fetchProfile.mockResolvedValueOnce(profile())
    await act(async () => { await result.current.retryProfile() })
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  it('does not refetch the profile on token refresh / tab refocus events for the same user', async () => {
    auth.session = session(); fetchProfile.mockResolvedValue(profile())
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => auth.listener('TOKEN_REFRESHED', session()))
    act(() => auth.listener('SIGNED_IN', session()))
    expect(fetchProfile).toHaveBeenCalledTimes(1)
  })

  it('renaming yourself refreshes the profile WITHOUT dropping back to the loading screen', async () => {
    auth.session = session(); fetchProfile.mockResolvedValue(profile())
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const seen = []
    fetchProfile.mockImplementation(async () => { seen.push(result.current.status); return profile({ display_name: 'Una B' }) })
    await act(async () => { await result.current.refreshProfile() })
    expect(seen).toEqual(['ready']) // never 'loading' => the app (and its realtime channels) stayed mounted
    expect(result.current.status).toBe('ready')
    expect(result.current.profile.display_name).toBe('Una B')
  })
})
