// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// Realtime stand-in that remembers every channel by name, with its handlers keyed "type:event:table".
const rt = { channels: {} }
const makeChannel = (name) => {
  const ch = {
    handlers: {}, subscribeCb: null, presence: {}, track: vi.fn(), untrack: vi.fn(),
    on(type, filter, cb) { ch.handlers[`${type}:${filter.event}:${filter.table ?? ''}`] = cb; return ch },
    subscribe(cb) { ch.subscribeCb = cb; cb('SUBSCRIBED'); return ch },
    presenceState: () => ch.presence,
  }
  rt.channels[name] = ch
  return ch
}
vi.mock('../src/lib/supabase', () => ({ supabase: { channel: vi.fn((name) => makeChannel(name)), removeChannel: vi.fn() } }))
vi.mock('../src/lib/api/chats', () => ({ fetchChatList: vi.fn(), markMessagesDelivered: vi.fn(), touchLastSeen: vi.fn() }))
vi.mock('../src/lib/api/friends', () => ({
  fetchPendingRequests: vi.fn(),
  acceptFriendRequest: vi.fn(async () => {}),
  declineFriendRequest: vi.fn(async () => {}),
}))

import { ChatsProvider } from '../src/hooks/ChatsProvider.jsx'
import { useChats, usePresence } from '../src/hooks/chatsContext.js'
import { fetchChatList, markMessagesDelivered, touchLastSeen } from '../src/lib/api/chats'
import { acceptFriendRequest, fetchPendingRequests } from '../src/lib/api/friends'

const chat = (name, over = {}) => ({ friendId: name, name, email: `${name}@x.co`, conversationId: `c-${name}`, last: null, unread: 0, ...over })
const wrapper = ({ children }) => <ChatsProvider userId="me">{children}</ChatsProvider>
const incoming = (conv, sender, id, at = '2026-01-02T00:00:00Z') => ({
  id, conversation_id: conv, sender_id: sender, content: 'hey', media_type: 'text', media_duration_ms: null, created_at: at,
})

async function setup(chats = [chat('amy'), chat('bob')], requests = []) {
  fetchChatList.mockResolvedValue(chats)
  fetchPendingRequests.mockResolvedValue(requests)
  const hook = renderHook(() => useChats(), { wrapper })
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  return hook
}
const visible = (v) => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (v ? 'visible' : 'hidden') })

const inbox = () => rt.channels['inbox:me']
const onMessage = (kind, payload) => inbox().handlers[`postgres_changes:${kind}:messages`](payload)
beforeEach(() => { vi.clearAllMocks(); rt.channels = {}; visible(true); document.title = 'AsyncComm' })

describe('ChatsProvider', () => {
  it('loads friends and requests together', async () => {
    const { result } = await setup([chat('amy')], [{ id: 'r1', sender: { id: 's', name: 'Dana', email: 'd@x.co' } }])
    expect(result.current.chats.map((c) => c.name)).toEqual(['amy'])
    expect(result.current.requests).toHaveLength(1)
  })

  it('reports an error if the first load fails', async () => {
    fetchChatList.mockRejectedValue(new Error("Couldn't load your chats."))
    fetchPendingRequests.mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useChats(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toMatch(/load your chats/)
  })

  it('a new message bumps unread, moves the chat to the top and updates the tab title', async () => {
    const { result } = await setup()
    act(() => onMessage('INSERT', { new: incoming('c-bob', 'bob', 'm1') }))
    expect(result.current.chats[0]).toMatchObject({ name: 'bob', unread: 1, last: { id: 'm1' } })
    expect(result.current.totalUnread).toBe(1)
    expect(document.title).toBe('(1) AsyncComm')
  })

  it('does not count a message in the conversation you are looking at', async () => {
    const { result } = await setup()
    act(() => result.current.setActiveConversation('c-bob'))
    act(() => onMessage('INSERT', { new: incoming('c-bob', 'bob', 'm1') }))
    expect(result.current.chats[0].unread).toBe(0)
  })

  it('does count it if that conversation is open but the tab is in the background', async () => {
    const { result } = await setup()
    act(() => result.current.setActiveConversation('c-bob'))
    visible(false)
    act(() => onMessage('INSERT', { new: incoming('c-bob', 'bob', 'm1') }))
    expect(result.current.chats[0].unread).toBe(1)
  })

  it('markReadLocal clears the badge and the title', async () => {
    const { result } = await setup([chat('amy', { unread: 4 })])
    expect(document.title).toBe('(4) AsyncComm')
    act(() => result.current.markReadLocal('c-amy'))
    expect(result.current.chats[0].unread).toBe(0)
    expect(document.title).toBe('AsyncComm')
  })

  it('refetches when a message arrives in a conversation it does not know yet', async () => {
    const { result } = await setup()
    fetchChatList.mockResolvedValue([chat('amy'), chat('bob'), chat('cat', { unread: 1 })])
    act(() => onMessage('INSERT', { new: incoming('c-new', 'cat', 'm9') }))
    await waitFor(() => expect(result.current.chats.map((c) => c.name)).toContain('cat'))
  })

  it('catches up after the realtime connection drops and returns', async () => {
    await setup()
    expect(fetchChatList).toHaveBeenCalledTimes(1)
    await act(async () => { inbox().subscribeCb('SUBSCRIBED') })
    expect(fetchChatList).toHaveBeenCalledTimes(2)
  })

  it('accepting a request removes it instantly, then re-syncs the friends list', async () => {
    const req = { id: 'r1', sender: { id: 's', name: 'Dana', email: 'd@x.co' } }
    const { result } = await setup([chat('amy')], [req])
    fetchChatList.mockResolvedValue([chat('amy'), chat('dana')])
    fetchPendingRequests.mockResolvedValue([])
    await act(async () => { await result.current.acceptRequest(req) })
    expect(acceptFriendRequest).toHaveBeenCalledWith('r1')
    expect(result.current.requests).toHaveLength(0)
    await waitFor(() => expect(result.current.chats.map((c) => c.name)).toContain('dana'))
  })

  it('brings a request back if accepting failed on the server', async () => {
    const req = { id: 'r1', sender: { id: 's', name: 'Dana', email: 'd@x.co' } }
    const { result } = await setup([chat('amy')], [req])
    acceptFriendRequest.mockRejectedValueOnce(new Error('nope'))
    await act(async () => { await result.current.acceptRequest(req).catch(() => {}) })
    await waitFor(() => expect(result.current.requests).toHaveLength(1)) // refetch restored it
  })

  it('keeps action functions stable across updates, so effects that depend on them do not re-run', async () => {
    const { result } = await setup()
    const before = { ...result.current }
    act(() => onMessage('INSERT', { new: incoming('c-bob', 'bob', 'm1') })) // state changes
    for (const k of ['setActiveConversation', 'markReadLocal', 'setConversationId', 'acceptRequest', 'declineRequest', 'refresh']) {
      expect(result.current[k], k).toBe(before[k])
    }
  })

  describe('delivery receipts', () => {
    it('tells the server this app has received its messages when it opens', async () => {
      await setup()
      await waitFor(() => expect(markMessagesDelivered).toHaveBeenCalled())
    })
    it('stamps a message as delivered as soon as one arrives from a friend (one call for a burst)', async () => {
      await setup()
      await waitFor(() => expect(markMessagesDelivered).toHaveBeenCalledTimes(1))
      act(() => { onMessage('INSERT', { new: incoming('c-bob', 'bob', 'm1') }); onMessage('INSERT', { new: incoming('c-bob', 'bob', 'm2') }) })
      await waitFor(() => expect(markMessagesDelivered).toHaveBeenCalledTimes(2))
    })
    it('does not do it for messages I sent myself', async () => {
      await setup()
      await waitFor(() => expect(markMessagesDelivered).toHaveBeenCalledTimes(1))
      act(() => onMessage('INSERT', { new: incoming('c-bob', 'me', 'mine') }))
      await new Promise((r) => setTimeout(r, 600))
      expect(markMessagesDelivered).toHaveBeenCalledTimes(1)
    })
  })

  describe('edits and deletes', () => {
    it('updates the chat-list preview when the latest message is edited, and when it is deleted', async () => {
      const last = { id: 'm1', type: 'text', content: 'old', senderId: 'bob', durationMs: null, at: '2026-01-01T00:00:00Z', deleted: false }
      const { result } = await setup([chat('bob', { last })])
      act(() => onMessage('UPDATE', { new: { id: 'm1', content: 'new', deleted_at: null } }))
      expect(result.current.chats[0].last.content).toBe('new')
      act(() => onMessage('UPDATE', { new: { id: 'm1', content: null, deleted_at: 'x' } }))
      expect(result.current.chats[0].last).toMatchObject({ deleted: true, content: null })
    })
  })

  describe('presence', () => {
    const wrapperWith = (friend) => renderHook(() => ({ chats: useChats(), p: usePresence(friend) }), { wrapper })
    const friend = { friendId: 'bob', lastSeenAt: '2026-01-01T09:00:00Z' }

    it('shows friends who are online, never counting myself', async () => {
      fetchChatList.mockResolvedValue([chat('bob')]); fetchPendingRequests.mockResolvedValue([])
      const { result } = wrapperWith(friend)
      await waitFor(() => expect(result.current.chats.status).toBe('ready'))
      expect(result.current.p.online).toBe(false)
      act(() => { rt.channels['presence:online'].presence = { bob: [{}], me: [{}] }; rt.channels['presence:online'].handlers['presence:sync:']() })
      expect(result.current.p.online).toBe(true)
      expect([...result.current.chats.onlineIds]).toEqual(['bob'])
    })

    it('when a friend leaves, their last seen becomes "just now" instead of the stale stored time', async () => {
      fetchChatList.mockResolvedValue([chat('bob')]); fetchPendingRequests.mockResolvedValue([])
      const { result } = wrapperWith(friend)
      await waitFor(() => expect(result.current.chats.status).toBe('ready'))
      expect(result.current.p.lastSeenAt).toBe('2026-01-01T09:00:00Z')
      act(() => rt.channels['presence:online'].handlers['presence:leave:']({ key: 'bob' }))
      expect(new Date(result.current.p.lastSeenAt).getTime()).toBeGreaterThan(Date.now() - 5000)
    })

    it('announces me as online while the tab is visible, and as offline when it is hidden', async () => {
      await setup()
      const ch = rt.channels['presence:online']
      expect(ch.track).toHaveBeenCalledTimes(1)
      visible(false); act(() => { document.dispatchEvent(new Event('visibilitychange')) })
      expect(ch.untrack).toHaveBeenCalledTimes(1)
      visible(true); act(() => { document.dispatchEvent(new Event('visibilitychange')) })
      expect(ch.track).toHaveBeenCalledTimes(2)
    })

    it('keeps my last seen fresh: on open, on a 60s heartbeat while visible, and when I leave', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
      renderHook(() => useChats(), { wrapper })
      expect(touchLastSeen).toHaveBeenCalledTimes(1)
      act(() => { vi.advanceTimersByTime(60_000) })
      expect(touchLastSeen).toHaveBeenCalledTimes(2)
      visible(false)
      act(() => { vi.advanceTimersByTime(60_000) })
      expect(touchLastSeen).toHaveBeenCalledTimes(2) // no heartbeat from a background tab
      act(() => { document.dispatchEvent(new Event('visibilitychange')) })
      expect(touchLastSeen).toHaveBeenCalledTimes(3) // ...but a final write as it goes away
      vi.useRealTimers()
    })
  })
})
