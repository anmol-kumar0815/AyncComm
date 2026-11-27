// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../src/lib/api/friends', () => ({
  sendFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  declineFriendRequest: vi.fn(),
  fetchPendingRequests: vi.fn(),
}))
vi.mock('../src/lib/api/auth', () => ({ signOut: vi.fn(), updateDisplayName: vi.fn() }))

import ChatListPane from '../src/components/chat/ChatListPane.jsx'
import { ChatsContext } from '../src/hooks/chatsContext.js'
import { ToastProvider } from '../src/components/ui/toast.jsx'
import { sendFriendRequest } from '../src/lib/api/friends'

const me = { id: 'me', email: 'me@example.com' }
const chat = (name, over = {}) => ({
  friendId: name.toLowerCase(), name, email: `${name.toLowerCase()}@example.com`, conversationId: `c-${name}`,
  last: null, unread: 0, ...over,
})
const at = (minsAgo) => new Date(Date.now() - minsAgo * 60_000).toISOString()

let ctx
const mount = (over = {}) => {
  ctx = { chats: [], requests: [], status: 'ready', error: null, refresh: vi.fn(), acceptRequest: vi.fn(async () => {}), declineRequest: vi.fn(async () => {}), ...over }
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ChatsContext.Provider value={ctx}>
          <ChatListPane user={me} profile={{ display_name: 'Me Myself' }} onProfileChanged={vi.fn()} />
        </ChatsContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())

describe('chat list', () => {
  it('lists every friend, linking straight to their conversation (one tap to chat)', () => {
    mount({ chats: [chat('Alice'), chat('Bob')] })
    const link = screen.getByRole('link', { name: /Alice/ })
    expect(link).toHaveAttribute('href', '/chat/alice')
    expect(screen.getAllByText('Say hi 👋')).toHaveLength(2) // friends you haven't spoken to yet
  })

  it('shows last message, who sent it, and an unread badge', () => {
    mount({
      chats: [
        chat('Alice', { unread: 3, last: { id: 'm', type: 'text', content: 'are you there?', senderId: 'alice', at: at(2) } }),
        chat('Bob', { last: { id: 'n', type: 'audio', content: '', senderId: 'me', durationMs: 7000, at: at(5) } }),
        chat('Cara', { last: { id: 'o', type: 'image', content: '', senderId: 'cara', at: at(9) } }),
      ],
    })
    const alice = screen.getByRole('link', { name: /Alice/ })
    expect(within(alice).getByText('are you there?')).toBeInTheDocument()
    expect(within(alice).getByLabelText('3 unread')).toHaveTextContent('3')
    expect(within(screen.getByRole('link', { name: /Bob/ })).getByText('You: 🎤 Voice message (0:07)')).toBeInTheDocument()
    expect(within(screen.getByRole('link', { name: /Cara/ })).getByText('📷 Photo')).toBeInTheDocument()
    expect(within(screen.getByRole('link', { name: /Bob/ })).queryByLabelText(/unread/)).not.toBeInTheDocument()
  })

  it('caps huge unread counts', () => {
    mount({ chats: [chat('Alice', { unread: 250, last: { id: 'm', type: 'text', content: 'x', senderId: 'alice', at: at(1) } })] })
    expect(screen.getByLabelText('250 unread')).toHaveTextContent('99+')
  })

  it('shows a spinner while loading and a retry when loading fails', async () => {
    const { unmount } = mount({ status: 'loading' })
    expect(screen.getByLabelText('Loading chats')).toBeInTheDocument()
    unmount()
    const u = userEvent.setup()
    mount({ status: 'error', error: "Couldn't load your chats." })
    await u.click(screen.getByRole('button', { name: 'Try again' }))
    expect(ctx.refresh).toHaveBeenCalled()
  })

  it('only shows search once the list is long enough to need it, and filters by name or email', async () => {
    const u = userEvent.setup()
    const { unmount } = mount({ chats: [chat('Alice'), chat('Bob')] })
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    unmount()

    mount({ chats: ['Alice', 'Bob', 'Cara', 'Dev', 'Eve', 'Finn'].map((n) => chat(n)) })
    await u.type(screen.getByRole('searchbox', { name: 'Search friends' }), 'EVE')
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link', { name: /Eve/ })).toBeInTheDocument()
    await u.clear(screen.getByRole('searchbox'))
    await u.type(screen.getByRole('searchbox'), 'zzz')
    expect(screen.getByText(/No friends match/)).toBeInTheDocument()
  })
})

describe('friend requests', () => {
  const req = { id: 'r1', createdAt: at(1), sender: { id: 's1', name: 'Dana', email: 'dana@example.com' } }

  it('appear at the top of the list and are accepted in a single tap', async () => {
    const u = userEvent.setup()
    mount({ requests: [req], chats: [chat('Alice')] })
    const section = screen.getByRole('region', { name: 'Friend requests' })
    expect(within(section).getByText('Dana')).toBeInTheDocument()
    await u.click(within(section).getByRole('button', { name: 'Accept Dana' }))
    expect(ctx.acceptRequest).toHaveBeenCalledWith(req)
    expect(await screen.findByRole('status')).toHaveTextContent('You and Dana are now friends.')
  })

  it('can be declined', async () => {
    const u = userEvent.setup()
    mount({ requests: [req] })
    await u.click(screen.getByRole('button', { name: 'Decline Dana' }))
    expect(ctx.declineRequest).toHaveBeenCalledWith(req)
  })

  it('shows an error if accepting fails, and lets them try again', async () => {
    const u = userEvent.setup()
    mount({ requests: [req] })
    ctx.acceptRequest.mockRejectedValueOnce(new Error("Couldn't accept the request."))
    await u.click(screen.getByRole('button', { name: 'Accept Dana' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't accept")
    expect(screen.getByRole('button', { name: 'Accept Dana' })).toBeEnabled()
  })
})

describe('adding friends', () => {
  it('a brand-new user sees the invite form right in the empty list (no extra tap)', async () => {
    sendFriendRequest.mockResolvedValue({ ok: true, code: 'sent', text: 'Invite sent to a@b.co.' })
    const u = userEvent.setup()
    mount()
    expect(screen.getByText('Add your first friend')).toBeInTheDocument()
    await u.type(screen.getByLabelText("Friend's email"), 'a@b.co{Enter}')
    expect(sendFriendRequest).toHaveBeenCalledWith('a@b.co')
    expect(await screen.findByText('Invite sent to a@b.co.')).toBeInTheDocument()
    expect(screen.getByLabelText("Friend's email")).toHaveValue('') // ready for the next one
  })

  it('explains non-success outcomes instead of failing silently', async () => {
    sendFriendRequest.mockResolvedValue({ ok: false, code: 'already_friends', text: "You're already friends with a@b.co." })
    const u = userEvent.setup()
    mount()
    await u.type(screen.getByLabelText("Friend's email"), 'a@b.co{Enter}')
    expect(await screen.findByText(/already friends/)).toBeInTheDocument()
    expect(screen.getByLabelText("Friend's email")).toHaveValue('a@b.co') // kept so they can fix a typo
  })

  it('the header button opens an add-friend dialog with the field focused', async () => {
    const u = userEvent.setup()
    mount({ chats: [chat('Alice')] })
    await u.click(screen.getByRole('button', { name: 'Add a friend' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a friend', hidden: true })
    expect(within(dialog).getByLabelText("Friend's email")).toHaveFocus()
  })
})
