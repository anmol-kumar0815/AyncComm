// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const rt = { handlers: {}, subscribeCb: null }
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on(_t, filter, cb) { rt.handlers[filter.table] = cb; return this },
      subscribe(cb) { rt.subscribeCb = cb; cb('SUBSCRIBED'); return this },
    })),
    removeChannel: vi.fn(),
  },
}))
vi.mock('../src/lib/api/chats', () => ({ fetchChatList: vi.fn() }))
vi.mock('../src/lib/api/friends', () => ({
  fetchPendingRequests: vi.fn(),
  acceptFriendRequest: vi.fn(async () => {}),
  declineFriendRequest: vi.fn(async () => {}),
}))

import { ChatsProvider } from '../src/hooks/ChatsProvider.jsx'
import { useChats } from '../src/hooks/chatsContext.js'
import { fetchChatList } from '../src/lib/api/chats'
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

beforeEach(() => { vi.clearAllMocks(); rt.handlers = {}; visible(true); document.title = 'AsyncComm' })

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
    act(() => rt.handlers.messages({ new: incoming('c-bob', 'bob', 'm1') }))
    expect(result.current.chats[0]).toMatchObject({ name: 'bob', unread: 1, last: { id: 'm1' } })
    expect(result.current.totalUnread).toBe(1)
    expect(document.title).toBe('(1) AsyncComm')
  })

  it('does not count a message in the conversation you are looking at', async () => {
    const { result } = await setup()
    act(() => result.current.setActiveConversation('c-bob'))
    act(() => rt.handlers.messages({ new: incoming('c-bob', 'bob', 'm1') }))
    expect(result.current.chats[0].unread).toBe(0)
  })

  it('does count it if that conversation is open but the tab is in the background', async () => {
    const { result } = await setup()
    act(() => result.current.setActiveConversation('c-bob'))
    visible(false)
    act(() => rt.handlers.messages({ new: incoming('c-bob', 'bob', 'm1') }))
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
    act(() => rt.handlers.messages({ new: incoming('c-new', 'cat', 'm9') }))
    await waitFor(() => expect(result.current.chats.map((c) => c.name)).toContain('cat'))
  })

  it('catches up after the realtime connection drops and returns', async () => {
    await setup()
    expect(fetchChatList).toHaveBeenCalledTimes(1)
    await act(async () => { rt.subscribeCb('SUBSCRIBED') })
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
    act(() => rt.handlers.messages({ new: incoming('c-bob', 'bob', 'm1') })) // state changes
    for (const k of ['setActiveConversation', 'markReadLocal', 'setConversationId', 'acceptRequest', 'declineRequest', 'refresh']) {
      expect(result.current[k], k).toBe(before[k])
    }
  })
})
