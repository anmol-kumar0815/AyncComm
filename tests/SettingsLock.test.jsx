// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../src/lib/api/auth', () => ({ signOut: vi.fn(), updateDisplayName: vi.fn() }))
import SettingsDialog from '../src/components/settings/SettingsDialog.jsx'
import { AppLockContext } from '../src/hooks/appLockContext.js'
import { ToastProvider } from '../src/components/ui/toast.jsx'

const user = { id: 'u1', email: 'me@example.com' }
let lock
const mount = (enabled = false) => {
  lock = { enabled, enable: vi.fn(async () => {}), disable: vi.fn(async () => {}) }
  return render(
    <ToastProvider>
      <AppLockContext.Provider value={lock}>
        <SettingsDialog open onClose={vi.fn()} user={user} profile={{ display_name: 'Me' }} onProfileChanged={vi.fn()} />
      </AppLockContext.Provider>
    </ToastProvider>,
  )
}
const toggle = () => screen.getByRole('switch', { name: /Ask for my password when I open the app/ })
beforeEach(() => vi.clearAllMocks())

describe('app lock setting', () => {
  it('is an off switch by default, explained in plain words (per device)', () => {
    mount()
    expect(toggle()).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(/On this device only/)).toBeInTheDocument()
  })

  it('shows on when the lock is enabled', () => {
    mount(true)
    expect(toggle()).toHaveAttribute('aria-checked', 'true')
  })

  it('turning on asks for the password first, then enables with it', async () => {
    const u = userEvent.setup()
    mount()
    await u.click(toggle())
    expect(lock.enable).not.toHaveBeenCalled() // nothing happens until they prove it
    expect(screen.getByLabelText('Enter your password to turn the lock on')).toHaveFocus()
    await u.type(screen.getByLabelText('Enter your password to turn the lock on'), 'my-secret{Enter}')
    expect(lock.enable).toHaveBeenCalledWith('my-secret')
    expect(await screen.findByRole('status')).toHaveTextContent('App lock is on for this device.')
    expect(screen.queryByLabelText(/Enter your password/)).not.toBeInTheDocument() // form closes
  })

  it('a wrong password shows the reason inside the form and keeps it open', async () => {
    const u = userEvent.setup()
    mount()
    lock.enable.mockRejectedValueOnce(new Error("That email and password don't match."))
    await u.click(toggle())
    await u.type(screen.getByLabelText(/turn the lock on/), 'bad{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent("don't match")
    expect(screen.getByLabelText(/turn the lock on/)).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('turning off also needs the password', async () => {
    const u = userEvent.setup()
    mount(true)
    await u.click(toggle())
    await u.type(screen.getByLabelText('Enter your password to turn the lock off'), 'my-secret{Enter}')
    expect(lock.disable).toHaveBeenCalledWith('my-secret')
    expect(lock.enable).not.toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('App lock is off.')
  })

  it('Cancel changes nothing', async () => {
    const u = userEvent.setup()
    mount()
    await u.click(toggle())
    await u.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(lock.enable).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(/Enter your password/)).not.toBeInTheDocument()
    expect(toggle()).toHaveAttribute('aria-checked', 'false')
  })

  it("can't submit an empty password", async () => {
    const u = userEvent.setup()
    mount()
    await u.click(toggle())
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeDisabled()
  })
})
