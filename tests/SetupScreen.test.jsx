// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../src/lib/api/auth', () => ({ completeAccount: vi.fn(), signOut: vi.fn() }))
import SetupScreen from '../src/components/auth/SetupScreen.jsx'
import { completeAccount, signOut } from '../src/lib/api/auth'

const user = { id: 'u1', email: 'new@example.com' }
let onDone
beforeEach(() => { vi.clearAllMocks(); onDone = vi.fn() })

describe('first-time setup', () => {
  it('collects a name and password, saves both, then continues', async () => {
    completeAccount.mockResolvedValue()
    const u = userEvent.setup()
    render(<SetupScreen user={user} profile={{ display_name: 'new' }} isRecovery={false} onDone={onDone} />)
    expect(screen.getByText(/new@example.com is verified/)).toBeInTheDocument()
    expect(screen.getByLabelText('Your name')).toHaveFocus()

    await u.type(screen.getByLabelText('Your name'), '  Alice Johnson ')
    await u.type(screen.getByLabelText('Password'), 'correct-horse{Enter}')
    expect(completeAccount).toHaveBeenCalledWith({ userId: 'u1', password: 'correct-horse', name: 'Alice Johnson' })
    expect(onDone).toHaveBeenCalled()
  })

  it('does not save with a missing name or a short password, and says why', async () => {
    const u = userEvent.setup()
    render(<SetupScreen user={user} profile={{}} isRecovery={false} onDone={onDone} />)
    await u.type(screen.getByLabelText('Password'), 'longenough{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('enter your name')

    await u.type(screen.getByLabelText('Your name'), 'Al')
    await u.clear(screen.getByLabelText('Password'))
    await u.type(screen.getByLabelText('Password'), 'short{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('at least 8 characters')
    expect(completeAccount).not.toHaveBeenCalled()
  })

  it('stays on the page with the error if saving fails, so they can try again', async () => {
    completeAccount.mockRejectedValueOnce(new Error('Choose a stronger password (at least 8 characters).'))
    const u = userEvent.setup()
    render(<SetupScreen user={user} profile={{}} isRecovery={false} onDone={onDone} />)
    await u.type(screen.getByLabelText('Your name'), 'Al')
    await u.type(screen.getByLabelText('Password'), 'password1{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('stronger password')
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  it('offers a way out if they signed in with the wrong email', async () => {
    const u = userEvent.setup()
    render(<SetupScreen user={user} profile={{}} isRecovery={false} onDone={onDone} />)
    await u.click(screen.getByRole('button', { name: 'Use a different email' }))
    expect(signOut).toHaveBeenCalled()
  })
})

describe('password reset', () => {
  it('only asks for a new password when the name is already known', async () => {
    completeAccount.mockResolvedValue()
    const u = userEvent.setup()
    render(<SetupScreen user={user} profile={{ display_name: 'Alice' }} isRecovery onDone={onDone} />)
    expect(screen.getByText('Choose a new password')).toBeInTheDocument()
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveFocus()
    await u.type(screen.getByLabelText('Password'), 'brand-new-pass{Enter}')
    expect(completeAccount).toHaveBeenCalledWith({ userId: 'u1', password: 'brand-new-pass', name: null })
  })
})
