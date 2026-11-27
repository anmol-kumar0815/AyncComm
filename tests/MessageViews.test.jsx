// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const media = { url: 'https://signed.example/img.jpg', failed: false }
vi.mock('../src/hooks/useMediaUrl', () => ({ useMediaUrl: () => media }))

import MessageBubble from '../src/components/chat/MessageBubble.jsx'
import MessageList from '../src/components/chat/MessageList.jsx'

const base = {
  id: 'm1', conversation_id: 'c', sender_id: 'friend', content: 'hello', media_type: 'text',
  media_path: null, media_mime: null, media_duration_ms: null, media_width: null, media_height: null,
  created_at: new Date().toISOString(),
}
const handlers = () => ({ onRetry: vi.fn(), onDiscard: vi.fn(), onOpenImage: vi.fn() })
const bubble = (message, extra = {}) =>
  render(<MessageBubble message={{ ...base, ...message }} mine={false} startsRun endsRun {...handlers()} {...extra} />)

beforeEach(() => { media.url = 'https://signed.example/img.jpg'; media.failed = false })

describe('MessageBubble', () => {
  it('right-aligns my messages and left-aligns theirs', () => {
    const mine = bubble({ sender_id: 'me' }, { mine: true }).container.firstChild
    const theirs = bubble({}).container.firstChild
    expect(mine.className).toContain('items-end')
    expect(theirs.className).toContain('items-start')
  })

  it('keeps line breaks and wraps very long words', () => {
    bubble({ content: 'a\nb' })
    const p = screen.getByText((_, el) => el.tagName === 'P' && el.textContent === 'a\nb')
    expect(p.className).toContain('whitespace-pre-wrap')
    expect(p.className).toContain('overflow-wrap:anywhere')
  })

  it('renders HTML-looking text as plain text (no injection)', () => {
    bubble({ content: '<img src=x onerror=alert(1)>' })
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })

  it('shows 1-3 emoji big and bubble-less, but a sentence normally', () => {
    const big = bubble({ content: '😀🎉' }).container
    expect(within(big).getByText('😀🎉').className).toContain('text-5xl')
    expect(big.querySelector('.bg-white')).toBeNull()
    document.body.innerHTML = ''
    const normal = bubble({ content: 'hi 😀' }).container
    expect(within(normal).getByText('hi 😀').className).not.toContain('text-5xl')
  })

  it('shows sending / sent status on my messages only', () => {
    const { unmount } = bubble({ pending: true }, { mine: true })
    expect(screen.getByLabelText('Sending')).toBeInTheDocument()
    unmount()
    bubble({}, { mine: true })
    expect(screen.getByLabelText('Sent')).toBeInTheDocument()
    document.body.innerHTML = ''
    bubble({})
    expect(screen.queryByLabelText('Sent')).not.toBeInTheDocument()
  })

  it('a failed message offers Retry and Delete', async () => {
    const h = handlers()
    const u = userEvent.setup()
    render(<MessageBubble message={{ ...base, id: 'f1', failed: true }} mine startsRun endsRun {...h} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Not sent')
    await u.click(screen.getByRole('button', { name: 'Retry' }))
    await u.click(screen.getByRole('button', { name: 'Delete' }))
    expect(h.onRetry).toHaveBeenCalledWith('f1')
    expect(h.onDiscard).toHaveBeenCalledWith('f1')
  })

  describe('photos', () => {
    const photo = { media_type: 'image', media_path: 'c/p.jpg', media_width: 1600, media_height: 1200, content: 'sunset' }

    it('reserves the final size before the image loads and shows the caption', () => {
      bubble(photo)
      const btn = screen.getByRole('button', { name: /Open photo: sunset/ })
      expect(btn.style.width).toBe('320px')
      expect(btn.style.aspectRatio).toBe('320 / 240')
      expect(screen.getByText('sunset', { selector: 'p' })).toBeInTheDocument()
    })

    it('opens the viewer with the signed URL', async () => {
      const h = handlers()
      const u = userEvent.setup()
      render(<MessageBubble message={{ ...base, ...photo }} mine={false} startsRun endsRun {...h} />)
      await u.click(screen.getByRole('button', { name: /Open photo/ }))
      expect(h.onOpenImage).toHaveBeenCalledWith({ url: 'https://signed.example/img.jpg', alt: 'sunset' })
    })

    it('shows an upload spinner while sending, and cannot be opened before there is a URL', () => {
      media.url = null
      bubble({ ...photo, pending: true })
      expect(screen.getByLabelText('Uploading')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Open photo/ })).toBeDisabled()
    })

    it('degrades gracefully when the image cannot be loaded', () => {
      media.url = null
      media.failed = true
      bubble(photo)
      expect(screen.getByText("Couldn't load photo")).toBeInTheDocument()
    })
  })

  it('renders a voice note as a player with its stored duration', () => {
    bubble({ media_type: 'audio', media_path: 'c/v.webm', media_duration_ms: 12_000, content: '' })
    expect(screen.getByRole('button', { name: 'Play voice note' })).toBeInTheDocument()
    expect(screen.getByText('0:12')).toBeInTheDocument()
  })
})

describe('MessageList', () => {
  const props = (over = {}) => ({
    messages: [], meId: 'me', friendName: 'Alice', status: 'ready', error: '', hasMore: false, loadingMore: false,
    onLoadEarlier: vi.fn(), onReload: vi.fn(), ...handlers(), ...over,
  })

  it('invites you to say hi in an empty chat', () => {
    render(<MessageList {...props()} />)
    expect(screen.getByText('No messages yet')).toBeInTheDocument()
    expect(screen.getByText('Say hi to Alice.')).toBeInTheDocument()
  })

  it('groups messages under a day separator and labels the log for screen readers', () => {
    render(<MessageList {...props({ messages: [{ ...base, id: 'a' }, { ...base, id: 'b', content: 'second' }] })} />)
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByRole('log', { name: 'Conversation with Alice' })).toBeInTheDocument()
    expect(screen.getByText('second')).toBeInTheDocument()
  })

  it('offers older messages only when there are more, and asks for them on click', async () => {
    const p = props({ messages: [base], hasMore: true })
    const u = userEvent.setup()
    render(<MessageList {...p} />)
    await u.click(screen.getByRole('button', { name: 'Load earlier messages' }))
    expect(p.onLoadEarlier).toHaveBeenCalled()
  })

  it('does not offer it when history is complete', () => {
    render(<MessageList {...props({ messages: [base] })} />)
    expect(screen.queryByRole('button', { name: 'Load earlier messages' })).not.toBeInTheDocument()
  })

  it('shows a retryable error when the history cannot be loaded', async () => {
    const p = props({ status: 'error', error: "Couldn't load messages." })
    const u = userEvent.setup()
    render(<MessageList {...p} />)
    expect(screen.getByText("Couldn't load messages.")).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Try again' }))
    expect(p.onReload).toHaveBeenCalled()
  })

  it('shows a spinner while loading, and neither the empty state nor errors', () => {
    render(<MessageList {...props({ status: 'loading' })} />)
    expect(screen.getByLabelText('Loading messages')).toBeInTheDocument()
    expect(screen.queryByText('No messages yet')).not.toBeInTheDocument()
  })
})
