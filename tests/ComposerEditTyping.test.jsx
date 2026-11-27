// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('emoji-picker-react', () => ({ default: () => <div /> }))
import Composer from '../src/components/chat/Composer.jsx'
import { ToastProvider } from '../src/components/ui/toast.jsx'

let n = 0
let props
const mount = (over = {}, id = `ct-${++n}`) => {
  props = {
    conversationId: id, disabled: false, onSendText: vi.fn(), onPickImage: vi.fn(), onSendAudio: vi.fn(),
    onTyping: vi.fn(), onSaveEdit: vi.fn(), onCancelEdit: vi.fn(), ...over,
  }
  const ui = (p) => <ToastProvider><Composer {...p} /></ToastProvider>
  const view = render(ui(props))
  return { ...view, remount: (o) => { props = { ...props, ...o }; view.rerender(ui(props)) } }
}

describe('edit mode', () => {
  const editing = { id: 'm1', content: 'see you at 6' }

  it('pre-fills the message, says what is happening, and drops photo/voice buttons', () => {
    mount({ editing })
    expect(screen.getByLabelText('Edit message')).toHaveValue('see you at 6')
    expect(screen.getByLabelText('Edit message')).toHaveFocus()
    expect(screen.getByText('Editing message')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send a photo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record a voice note' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('Enter saves the new text for that message id', async () => {
    const u = userEvent.setup()
    mount({ editing })
    await u.type(screen.getByLabelText('Edit message'), ' 30{Enter}')
    expect(props.onSaveEdit).toHaveBeenCalledWith('m1', 'see you at 6 30')
    expect(props.onSendText).not.toHaveBeenCalled() // an edit is never sent as a new message
  })

  it('saving without changing anything just leaves edit mode (no pointless server call)', async () => {
    const u = userEvent.setup()
    mount({ editing })
    await u.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(props.onSaveEdit).not.toHaveBeenCalled()
    expect(props.onCancelEdit).toHaveBeenCalled()
  })

  it('cannot save an empty message', async () => {
    const u = userEvent.setup()
    mount({ editing })
    await u.clear(screen.getByLabelText('Edit message'))
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await u.keyboard('{Enter}')
    expect(props.onSaveEdit).not.toHaveBeenCalled()
  })

  it('Escape and the X cancel', async () => {
    const u = userEvent.setup()
    mount({ editing })
    fireEvent.keyDown(screen.getByLabelText('Edit message'), { key: 'Escape' })
    expect(props.onCancelEdit).toHaveBeenCalledTimes(1)
    await u.click(screen.getByRole('button', { name: 'Cancel editing' }))
    expect(props.onCancelEdit).toHaveBeenCalledTimes(2)
  })

  it("an edit in progress never becomes (or overwrites) the chat's draft", async () => {
    const u = userEvent.setup()
    const id = 'edit-draft'
    const normal = mount({}, id)
    await u.type(screen.getByLabelText('Message'), 'my real draft')
    normal.unmount()

    const edit = mount({ editing }, id)
    await u.type(screen.getByLabelText('Edit message'), ' more')
    edit.unmount()

    mount({}, id)
    expect(screen.getByLabelText('Message')).toHaveValue('my real draft')
  })

  it('does not announce "typing" while editing', async () => {
    mount({ editing })
    await userEvent.setup().type(screen.getByLabelText('Edit message'), 'abc')
    expect(props.onTyping).not.toHaveBeenCalled()
  })
})

describe('typing indicator', () => {
  beforeEach(() => vi.spyOn(Date, 'now'))
  afterEach(() => vi.restoreAllMocks())
  const at = (t) => Date.now.mockReturnValue(t)

  it('says "typing" on the first keystroke, then at most every 3 seconds', () => {
    mount()
    const box = screen.getByLabelText('Message')
    at(10_000); fireEvent.change(box, { target: { value: 'h' } })
    at(10_500); fireEvent.change(box, { target: { value: 'he' } })
    at(11_900); fireEvent.change(box, { target: { value: 'hel' } })
    expect(props.onTyping).toHaveBeenCalledTimes(1)
    expect(props.onTyping).toHaveBeenLastCalledWith(true)
    at(13_100); fireEvent.change(box, { target: { value: 'hell' } })
    expect(props.onTyping).toHaveBeenCalledTimes(2) // refreshed so the other side doesn't time out
  })

  it('says "stopped" when the box is emptied', () => {
    mount()
    const box = screen.getByLabelText('Message')
    at(10_000); fireEvent.change(box, { target: { value: 'h' } })
    fireEvent.change(box, { target: { value: '' } })
    expect(props.onTyping).toHaveBeenLastCalledWith(false)
  })

  it('says "stopped" when the message is sent', async () => {
    mount()
    const box = screen.getByLabelText('Message')
    at(10_000); fireEvent.change(box, { target: { value: 'hi' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(props.onSendText).toHaveBeenCalledWith('hi')
    expect(props.onTyping).toHaveBeenLastCalledWith(false)
  })

  it('stays quiet for whitespace-only input', () => {
    mount()
    at(10_000); fireEvent.change(screen.getByLabelText('Message'), { target: { value: '   ' } })
    expect(props.onTyping).not.toHaveBeenCalled()
  })
})
