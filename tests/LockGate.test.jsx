// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../src/lib/api/auth', () => ({ signInWithPassword: vi.fn(), signOut: vi.fn() }))
import LockGate from '../src/components/auth/LockGate.jsx'
import { useAppLock } from '../src/hooks/appLockContext.js'
import { signInWithPassword, signOut } from '../src/lib/api/auth'
import { isLockEnabled, isUnlocked, setLockEnabled, markUnlocked } from '../src/lib/appLock.js'

const user = { id: 'u1', email: 'me@example.com' }
let mounted
function Child() {
  mounted()
  const lock = useAppLock()
  return (
    <div>
      <p>the app ({lock.enabled ? 'lock on' : 'lock off'})</p>
      <button onClick={() => lock.enable('pw').catch((e) => { document.title = e.message })}>enable</button>
      <button onClick={() => lock.disable('pw').catch((e) => { document.title = e.message })}>disable</button>
    </div>
  )
}
const mount = () => render(<LockGate user={user}><Child /></LockGate>)

beforeEach(() => {
  vi.clearAllMocks()
  mounted = vi.fn()
  localStorage.clear()
  sessionStorage.clear()
  document.title = ''
  signInWithPassword.mockResolvedValue()
})

describe('lock off', () => {
  it('just shows the app', () => {
    mount()
    expect(screen.getByText('the app (lock off)')).toBeInTheDocument()
    expect(screen.queryByText('AsyncComm is locked')).not.toBeInTheDocument()
  })
})

describe('lock on, new tab', () => {
  beforeEach(() => setLockEnabled('u1', true))

  it('shows only the lock screen, and mounts NOTHING behind it (no chats, no realtime, no presence)', () => {
    mount()
    expect(screen.getByText('AsyncComm is locked')).toBeInTheDocument()
    expect(screen.getByText(/me@example.com/)).toBeInTheDocument()
    expect(screen.queryByText(/the app/)).not.toBeInTheDocument()
    expect(mounted).not.toHaveBeenCalled()
  })

  it('asks for the password only, with the field ready to type in', () => {
    mount()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled()
  })

  it('the right password unlocks, verified against the account email', async () => {
    const u = userEvent.setup()
    mount()
    await u.type(screen.getByLabelText('Password'), 'secret-pass{Enter}')
    expect(signInWithPassword).toHaveBeenCalledWith('me@example.com', 'secret-pass')
    expect(await screen.findByText('the app (lock on)')).toBeInTheDocument()
    expect(isUnlocked('u1')).toBe(true)
  })

  it('a wrong password shows the error, stays locked and clears the field', async () => {
    signInWithPassword.mockRejectedValueOnce(new Error("That email and password don't match."))
    const u = userEvent.setup()
    mount()
    await u.type(screen.getByLabelText('Password'), 'nope{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent("don't match")
    expect(screen.queryByText(/the app/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(isUnlocked('u1')).toBe(false)
  })

  it('offers a way out for someone who is not the account owner', async () => {
    mount()
    await userEvent.setup().click(screen.getByRole('button', { name: /use a different account/i }))
    expect(signOut).toHaveBeenCalled()
  })
})

describe('what counts as "opening the app"', () => {
  beforeEach(() => setLockEnabled('u1', true))

  it('a reload of an unlocked tab does not ask again', () => {
    markUnlocked('u1') // same tab, sessionStorage survives a reload
    mount()
    expect(screen.getByText('the app (lock on)')).toBeInTheDocument()
  })

  it('a brand-new tab (empty sessionStorage) asks again', () => {
    markUnlocked('u1')
    sessionStorage.clear()
    mount()
    expect(screen.getByText('AsyncComm is locked')).toBeInTheDocument()
  })
})

describe('turning it on and off', () => {
  it('needs the password to turn on, then stays unlocked in this tab but locks the next one', async () => {
    const u = userEvent.setup()
    mount()
    await u.click(screen.getByRole('button', { name: 'enable' }))
    expect(signInWithPassword).toHaveBeenCalledWith('me@example.com', 'pw')
    expect(await screen.findByText('the app (lock on)')).toBeInTheDocument()
    expect(isLockEnabled('u1')).toBe(true)
    expect(isUnlocked('u1')).toBe(true) // does not lock the tab they are using
    sessionStorage.clear() // closing the tab
    document.body.innerHTML = ''
    mount()
    expect(screen.getByText('AsyncComm is locked')).toBeInTheDocument()
  })

  it('a wrong password does NOT turn it on', async () => {
    signInWithPassword.mockRejectedValueOnce(new Error("That email and password don't match."))
    mount()
    await userEvent.setup().click(screen.getByRole('button', { name: 'enable' }))
    await vi.waitFor(() => expect(document.title).toMatch(/don't match/))
    expect(isLockEnabled('u1')).toBe(false)
    expect(screen.getByText('the app (lock off)')).toBeInTheDocument()
  })

  it('needs the password to turn off, and a wrong one leaves it on', async () => {
    setLockEnabled('u1', true)
    markUnlocked('u1')
    const u = userEvent.setup()
    mount()
    signInWithPassword.mockRejectedValueOnce(new Error("That email and password don't match."))
    await u.click(screen.getByRole('button', { name: 'disable' }))
    await vi.waitFor(() => expect(document.title).toMatch(/don't match/))
    expect(isLockEnabled('u1')).toBe(true)

    await u.click(screen.getByRole('button', { name: 'disable' }))
    expect(await screen.findByText('the app (lock off)')).toBeInTheDocument()
    expect(isLockEnabled('u1')).toBe(false)
  })
})
