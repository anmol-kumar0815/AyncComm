// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../src/hooks/useMediaUrl', () => ({ useMediaUrl: () => ({ url: 'blob:x', failed: false }) }))
import MessageBubble from '../src/components/chat/MessageBubble.jsx'
import MessageActionsDialog from '../src/components/chat/MessageActionsDialog.jsx'

const NOW = Date.now()
const base = {
  id: 'm1', conversation_id: 'c', sender_id: 'me', content: 'see you at 6', media_type: 'text', media_path: null,
  media_duration_ms: null, created_at: new Date(NOW - 2 * 60_000).toISOString(),
}
const bubble = (message, extra = {}) => {
  const h = { onRetry: vi.fn(), onDiscard: vi.fn(), onOpenImage: vi.fn(), onOpenActions: vi.fn() }
  const view = render(<MessageBubble message={{ ...base, ...message }} mine startsRun endsRun {...h} {...extra} />)
  return { ...view, h }
}

describe('ticks', () => {
  it.each([
    [{ pending: true }, 'Sending'],
    [{ failed: true }, 'Not sent'],
    [{}, 'Sent'],
    [{ delivered_at: '2026-01-01T10:00:00Z' }, 'Delivered'],
    [{ delivered_at: '2026-01-01T10:00:00Z', read_at: '2026-01-01T10:01:00Z' }, 'Read'],
  ])('%j shows "%s"', (over, label) => {
    bubble(over)
    expect(screen.getByLabelText(label)).toBeInTheDocument()
  })

  it('read ticks look different from delivered ticks (colour is not the only cue: label and icon too)', () => {
    const { unmount } = bubble({ delivered_at: 'x' })
    const delivered = screen.getByLabelText('Delivered')
    expect(delivered.getAttribute('class')).toContain('text-blue-200')
    unmount()
    bubble({ delivered_at: 'x', read_at: 'y' })
    expect(screen.getByLabelText('Read').getAttribute('class')).toContain('text-emerald-300')
  })

  it('double ticks for delivered/read, a single tick for sent', () => {
    const count = (label) => screen.getByLabelText(label).querySelectorAll('path').length
    const a = bubble({}); const single = count('Sent'); a.unmount()
    bubble({ delivered_at: 'x' })
    expect(count('Delivered')).toBeGreaterThan(single)
  })

  it("never shows ticks on the other person's messages", () => {
    bubble({ sender_id: 'friend' }, { mine: false })
    expect(screen.queryByLabelText(/Sent|Delivered|Read/)).not.toBeInTheDocument()
  })
})

describe('edited and deleted messages', () => {
  it('marks edited messages', () => {
    bubble({ edited_at: '2026-01-01T10:00:00Z' })
    expect(screen.getByText('edited')).toBeInTheDocument()
  })
  it('shows a tombstone for a deleted message: no content, no ticks, no options', () => {
    bubble({ deleted_at: '2026-01-01T10:00:00Z', content: null, delivered_at: 'x', read_at: 'y' })
    expect(screen.getByText('This message was deleted')).toBeInTheDocument()
    expect(screen.queryByLabelText('Read')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Message options' })).not.toBeInTheDocument()
  })
  it('a deleted photo shows the tombstone, not an image', () => {
    bubble({ deleted_at: 'x', media_type: 'image', media_path: null, content: null })
    expect(screen.getByText('This message was deleted')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('options button', () => {
  it('opens the options for my sent message', async () => {
    const { h } = bubble({})
    await userEvent.setup().click(screen.getByRole('button', { name: 'Message options' }))
    expect(h.onOpenActions).toHaveBeenCalledWith('m1')
  })
  it.each([
    ['their message', { sender_id: 'friend' }, { mine: false }],
    ['a message still sending', { pending: true }, {}],
    ['a message that failed', { failed: true }, {}],
  ])('is not offered on %s', (_n, over, extra) => {
    bubble(over, extra)
    expect(screen.queryByRole('button', { name: 'Message options' })).not.toBeInTheDocument()
  })
})

describe('MessageActionsDialog', () => {
  let h
  const open = (message = {}) => {
    h = { onClose: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(async () => {}) }
    const props = (m) => ({ message: { ...base, ...m }, meId: 'me', friendName: 'Alice', ...h })
    const view = render(<MessageActionsDialog {...props(message)} />)
    return { ...view, props, rerenderWith: (m) => view.rerender(<MessageActionsDialog {...props(m)} />) }
  }
  beforeEach(() => vi.clearAllMocks())

  it('offers info, edit (with the time left) and delete for a fresh text message', () => {
    open()
    expect(screen.getByRole('button', { name: /Message info/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Edit message/ })).toHaveTextContent('13 min left')
    expect(screen.getByRole('button', { name: /Delete for everyone/ })).toBeInTheDocument()
    expect(screen.getByText('see you at 6')).toBeInTheDocument()
  })

  it('hides Edit once the 15 minutes are over, but still allows delete', () => {
    open({ created_at: new Date(NOW - 20 * 60_000).toISOString() })
    expect(screen.queryByRole('button', { name: /Edit message/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Delete for everyone/ })).toBeInTheDocument()
  })

  it('hides Edit for photos and voice notes', () => {
    open({ media_type: 'image', media_path: 'p', content: 'caption' })
    expect(screen.queryByRole('button', { name: /Edit message/ })).not.toBeInTheDocument()
  })

  it('Edit hands the message to the composer and closes', async () => {
    open()
    await userEvent.setup().click(screen.getByRole('button', { name: /Edit message/ }))
    expect(h.onEdit).toHaveBeenCalledWith('m1')
    expect(h.onClose).toHaveBeenCalled()
  })

  it('Info shows when it was sent, and says plainly what has not happened yet', async () => {
    open()
    await userEvent.setup().click(screen.getByRole('button', { name: /Message info/ }))
    expect(screen.getByText('Sent')).toBeInTheDocument()
    expect(screen.getByText('Not delivered to Alice yet')).toBeInTheDocument()
    expect(screen.getByText("Alice hasn't read it yet")).toBeInTheDocument()
  })

  it('Info shows delivered and read times, and updates live when Alice reads it while it is open', async () => {
    const { rerenderWith } = open({ delivered_at: new Date(NOW - 60_000).toISOString() })
    await userEvent.setup().click(screen.getByRole('button', { name: /Message info/ }))
    expect(screen.queryByText('Not delivered to Alice yet')).not.toBeInTheDocument()
    expect(screen.getByText("Alice hasn't read it yet")).toBeInTheDocument()
    rerenderWith({ delivered_at: new Date(NOW - 60_000).toISOString(), read_at: new Date(NOW).toISOString() })
    expect(screen.queryByText("Alice hasn't read it yet")).not.toBeInTheDocument()
    const read = screen.getByText('Read').closest('div').parentElement
    expect(within(read).getByLabelText('Read')).toBeInTheDocument()
  })

  it('shows the edit time in Info for edited messages', async () => {
    open({ edited_at: new Date(NOW).toISOString() })
    await userEvent.setup().click(screen.getByRole('button', { name: /Message info/ }))
    expect(screen.getByText('Edited')).toBeInTheDocument()
  })

  it('asks before deleting, and Cancel changes nothing', async () => {
    const u = userEvent.setup()
    open()
    await u.click(screen.getByRole('button', { name: /Delete for everyone/ }))
    expect(h.onDelete).not.toHaveBeenCalled()
    expect(screen.getByText(/removes the message for everyone, including Alice/)).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(h.onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Delete for everyone/ })).toBeInTheDocument()
  })

  it('confirming deletes that message and closes', async () => {
    const u = userEvent.setup()
    open()
    await u.click(screen.getByRole('button', { name: /Delete for everyone/ }))
    await u.click(screen.getByRole('button', { name: 'Delete' }))
    expect(h.onDelete).toHaveBeenCalledWith('m1')
    expect(h.onClose).toHaveBeenCalled()
  })
})
