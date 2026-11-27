// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// A controllable stand-in for the real recorder hook (the real one is covered in useVoiceRecorder.test.js).
const rec = { phase: 'idle', elapsedMs: 0, level: 0, start: vi.fn(), stop: vi.fn(), cancel: vi.fn() }
vi.mock('../src/hooks/useVoiceRecorder', () => ({ useVoiceRecorder: () => rec }))
// The real picker is a ~300 KB lazy chunk; a tiny stand-in is enough to test our wiring.
vi.mock('emoji-picker-react', () => ({
  default: ({ onEmojiClick }) => (
    <div data-testid="picker"><button onClick={() => onEmojiClick({ emoji: '😀' })}>pick-grin</button></div>
  ),
}))

import Composer from '../src/components/chat/Composer.jsx'
import { ToastProvider } from '../src/components/ui/toast.jsx'

let props
let nextId = 0
// Drafts live in a module-level map (that's the feature), so every test gets its own conversation.
const mount = (over = {}, id = `conv-${++nextId}`) => {
  props = { conversationId: id, disabled: false, onSendText: vi.fn(), onPickImage: vi.fn(), onSendAudio: vi.fn(), ...over }
  return render(<ToastProvider><Composer {...props} /></ToastProvider>)
}
const box = () => screen.getByLabelText('Message')

beforeEach(() => {
  Object.assign(rec, { phase: 'idle', elapsedMs: 0, level: 0 })
  rec.start = vi.fn(async () => ({ ok: true }))
  rec.stop = vi.fn()
  rec.cancel = vi.fn()
})

describe('text', () => {
  it('Enter sends, trims, clears the box and keeps focus for the next message', async () => {
    const u = userEvent.setup()
    mount()
    await u.type(box(), '  hello there  {Enter}')
    expect(props.onSendText).toHaveBeenCalledExactlyOnceWith('hello there')
    expect(box()).toHaveValue('')
    expect(box()).toHaveFocus()
  })

  it('Shift+Enter inserts a newline instead of sending', async () => {
    const u = userEvent.setup()
    mount()
    await u.type(box(), 'line one{Shift>}{Enter}{/Shift}line two')
    expect(props.onSendText).not.toHaveBeenCalled()
    expect(box()).toHaveValue('line one\nline two')
  })

  it('never sends blank messages', async () => {
    const u = userEvent.setup()
    mount()
    await u.type(box(), '   {Enter}')
    expect(props.onSendText).not.toHaveBeenCalled()
  })

  it('does not send while the conversation is still loading', async () => {
    const u = userEvent.setup()
    mount({ disabled: true })
    await u.type(box(), 'too early{Enter}')
    expect(props.onSendText).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Send a photo' })).toBeDisabled()
  })

  it('does not send while an IME composition is in progress (e.g. Japanese input)', () => {
    mount()
    fireEvent.change(box(), { target: { value: 'にほん' } })
    fireEvent.keyDown(box(), { key: 'Enter', isComposing: true })
    expect(props.onSendText).not.toHaveBeenCalled()
  })

  it('uses one slot for microphone (empty) and send (has text)', async () => {
    const u = userEvent.setup()
    mount()
    expect(screen.getByRole('button', { name: 'Record a voice note' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument()
    await u.type(box(), 'x')
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record a voice note' })).not.toBeInTheDocument()
  })

  it('the Send button sends too', async () => {
    const u = userEvent.setup()
    mount()
    await u.type(box(), 'via button')
    await u.click(screen.getByRole('button', { name: 'Send message' }))
    expect(props.onSendText).toHaveBeenCalledWith('via button')
  })
})

describe('drafts', () => {
  it('keeps what you typed when you switch chats and come back', async () => {
    const u = userEvent.setup()
    const inA = mount({}, 'draft-A')
    await u.type(box(), 'half-written')
    inA.unmount()

    const inB = mount({}, 'draft-B')
    expect(box()).toHaveValue('') // a different chat starts empty
    inB.unmount()

    mount({}, 'draft-A')
    expect(box()).toHaveValue('half-written')
  })

  it('forgets the draft once it has been sent', async () => {
    const u = userEvent.setup()
    const first = mount({}, 'draft-C')
    await u.type(box(), 'sent already{Enter}')
    first.unmount()
    mount({}, 'draft-C')
    expect(box()).toHaveValue('')
  })
})

describe('emoji', () => {
  it('opens the panel, inserts at the caret, and Escape closes it', async () => {
    const u = userEvent.setup()
    mount()
    await u.type(box(), 'hi world')
    box().setSelectionRange(3, 3) // between "hi " and "world"
    await u.click(screen.getByRole('button', { name: 'Insert emoji' }))
    await u.click(await screen.findByText('pick-grin'))
    expect(box()).toHaveValue('hi 😀world')

    await u.click(screen.getByText('pick-grin')) // can add several in a row
    expect(box().value.match(/😀/g)).toHaveLength(2)

    fireEvent.keyDown(box(), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('picker')).not.toBeInTheDocument())
  })

  it('an emoji alone makes the send button appear (it is a real message)', async () => {
    const u = userEvent.setup()
    mount()
    await u.click(screen.getByRole('button', { name: 'Insert emoji' }))
    await u.click(await screen.findByText('pick-grin'))
    await u.click(screen.getByRole('button', { name: 'Send message' }))
    expect(props.onSendText).toHaveBeenCalledWith('😀')
  })
})

describe('photos', () => {
  it('hands a chosen file to the preview flow', async () => {
    const u = userEvent.setup()
    const { container } = mount()
    const file = new File(['x'], 'cat.png', { type: 'image/png' })
    await u.upload(container.querySelector('input[type=file]'), file)
    expect(props.onPickImage).toHaveBeenCalledWith(file)
  })

  it('offers only image types in the picker', () => {
    const { container } = mount()
    expect(container.querySelector('input[type=file]').accept).toBe('image/jpeg,image/png,image/webp,image/gif')
  })

  it('pasting a screenshot opens the preview instead of pasting nothing', () => {
    mount()
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    const ev = new Event('paste', { bubbles: true, cancelable: true })
    ev.clipboardData = { files: [file] }
    box().dispatchEvent(ev)
    expect(props.onPickImage).toHaveBeenCalledWith(file)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('leaves normal text pastes alone', () => {
    mount()
    const ev = new Event('paste', { bubbles: true, cancelable: true })
    ev.clipboardData = { files: [] }
    box().dispatchEvent(ev)
    expect(props.onPickImage).not.toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(false)
  })
})

describe('voice notes', () => {
  it('tapping the microphone starts recording', async () => {
    const u = userEvent.setup()
    mount()
    await u.click(screen.getByRole('button', { name: 'Record a voice note' }))
    expect(rec.start).toHaveBeenCalled()
  })

  it('tells the user when the microphone is blocked', async () => {
    rec.start = vi.fn(async () => ({ ok: false, error: 'Microphone access is blocked. Allow it in your browser’s site settings to send voice notes.' }))
    const u = userEvent.setup()
    mount()
    await u.click(screen.getByRole('button', { name: 'Record a voice note' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/blocked/i)
  })

  it('while recording, shows the timer with cancel and send instead of the text box', () => {
    Object.assign(rec, { phase: 'recording', elapsedMs: 65_000 })
    mount()
    expect(screen.getByRole('timer')).toHaveTextContent('1:05')
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel recording' }))
    expect(rec.cancel).toHaveBeenCalled()
  })

  it('sending a recording passes the blob, mime and duration on', async () => {
    Object.assign(rec, { phase: 'recording', elapsedMs: 4000 })
    const result = { blob: new Blob(['a']), mime: 'audio/webm', durationMs: 4200 }
    rec.stop = vi.fn(async () => result)
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Send voice note' }))
    await waitFor(() => expect(props.onSendAudio).toHaveBeenCalledWith(result))
  })

  it('does not send an accidental tap; it explains instead', async () => {
    Object.assign(rec, { phase: 'recording', elapsedMs: 300 })
    rec.stop = vi.fn(async () => ({ tooShort: true }))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Send voice note' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/too short/i)
    expect(props.onSendAudio).not.toHaveBeenCalled()
  })

  it('Escape cancels and Enter sends while recording', async () => {
    Object.assign(rec, { phase: 'recording', elapsedMs: 2000 })
    rec.stop = vi.fn(async () => ({ blob: new Blob(['a']), mime: 'audio/webm', durationMs: 2000 }))
    mount()
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(props.onSendAudio).toHaveBeenCalled())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(rec.cancel).toHaveBeenCalled()
  })
})
