// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const channel = { handlers: [], subscribeCb: null, send: vi.fn() }
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on(_type, _filter, cb) { channel.handlers.push(cb); return this },
      subscribe(cb) { channel.subscribeCb = cb; cb('SUBSCRIBED'); return this },
      send: (...a) => channel.send(...a),
    })),
    removeChannel: vi.fn(),
  },
}))
vi.mock('../src/lib/api/messages', () => ({
  fetchMessages: vi.fn(),
  insertMessage: vi.fn(),
  uploadChatMedia: vi.fn(),
  fetchMessage: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  hideMessage: vi.fn(),
}))

import { useMessages } from '../src/hooks/useMessages.js'
import { deleteMessage, editMessage, hideMessage, fetchMessage, fetchMessages, insertMessage, uploadChatMedia } from '../src/lib/api/messages'

// channel.handlers order is the order useMessages registers them
const [ON_INSERT, ON_UPDATE, ON_TYPING, ON_HIDDEN] = [0, 1, 2, 3]

const ME = 'me'
const FRIEND = 'friend'
const CONV = 'conv-1'
const row = (id, over = {}) => ({
  id, conversation_id: CONV, sender_id: FRIEND, content: id, media_type: 'text', media_path: null,
  media_mime: null, media_duration_ms: null, media_width: null, media_height: null,
  created_at: '2026-01-01T10:00:00Z', ...over,
})
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

async function setup(history = [row('h1')]) {
  fetchMessages.mockResolvedValue({ messages: history, hasMore: false })
  const hook = renderHook(() => useMessages(CONV, ME))
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  return hook
}

afterEach(() => vi.useRealTimers())
beforeEach(() => {
  vi.clearAllMocks()
  channel.handlers = []
  channel.send = vi.fn()
  let n = 0
  vi.stubGlobal('crypto', { randomUUID: () => `uuid-${++n}` })
  URL.createObjectURL = vi.fn(() => 'blob:local')
  URL.revokeObjectURL = vi.fn()
})

describe('loading', () => {
  it('shows history oldest-first once loaded', async () => {
    const { result } = await setup([row('a', { created_at: '2026-01-01T10:00:00Z' }), row('b', { created_at: '2026-01-01T10:01:00Z' })])
    expect(result.current.messages.map((m) => m.id)).toEqual(['a', 'b'])
  })
  it('reports a load failure and can retry', async () => {
    fetchMessages.mockRejectedValueOnce(new Error("Couldn't load messages."))
    const { result } = renderHook(() => useMessages(CONV, ME))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toMatch(/load/)
    fetchMessages.mockResolvedValueOnce({ messages: [row('a')], hasMore: false })
    await act(async () => { await result.current.reload() })
    expect(result.current.status).toBe('ready')
  })
  it('loads earlier pages and prepends them without duplicating', async () => {
    const { result } = await setup([row('b', { created_at: '2026-01-01T10:01:00Z' })])
    fetchMessages.mockResolvedValueOnce({ messages: [row('a', { created_at: '2026-01-01T10:00:00Z' }), row('b', { created_at: '2026-01-01T10:01:00Z' })], hasMore: true })
    await act(async () => { await result.current.loadEarlier() })
    expect(result.current.messages.map((m) => m.id)).toEqual(['a', 'b'])
    expect(result.current.hasMore).toBe(true)
    expect(fetchMessages).toHaveBeenLastCalledWith(CONV, { before: '2026-01-01T10:01:00Z' })
  })
})

describe('sending text', () => {
  it('shows the message instantly as pending, then confirms it with the server copy', async () => {
    const { result } = await setup()
    const d = deferred()
    insertMessage.mockReturnValueOnce(d.promise)

    act(() => { result.current.sendText('hello') })
    const pending = result.current.messages.find((m) => m.content === 'hello')
    expect(pending).toMatchObject({ pending: true, sender_id: ME, id: 'uuid-1' })

    await act(async () => { d.resolve(row('uuid-1', { sender_id: ME, content: 'hello', created_at: '2026-01-01T10:05:00Z' })) })
    const saved = result.current.messages.find((m) => m.id === 'uuid-1')
    expect(saved.pending).toBeUndefined()
    expect(saved.created_at).toBe('2026-01-01T10:05:00Z')

    const payload = insertMessage.mock.calls[0][0]
    expect(payload).toMatchObject({ id: 'uuid-1', conversation_id: CONV, sender_id: ME, content: 'hello', media_type: 'text' })
    expect(payload).not.toHaveProperty('created_at') // the server's clock decides
  })

  it('does not duplicate when realtime echoes our own message before the insert returns', async () => {
    const { result } = await setup()
    const d = deferred()
    insertMessage.mockReturnValueOnce(d.promise)
    act(() => { result.current.sendText('hi') })

    const server = row('uuid-1', { sender_id: ME, content: 'hi', created_at: '2026-01-01T10:05:00Z' })
    act(() => { channel.handlers[ON_INSERT]({ new: server }) }) // echo wins the race
    await act(async () => { d.resolve(server) })

    expect(result.current.messages.filter((m) => m.id === 'uuid-1')).toHaveLength(1)
    expect(result.current.messages.find((m) => m.id === 'uuid-1').pending).toBeUndefined()
  })

  it('shows messages from the other person as they arrive', async () => {
    const { result } = await setup()
    act(() => { channel.handlers[ON_INSERT]({ new: row('in-1', { created_at: '2026-01-01T11:00:00Z' }) }) })
    expect(result.current.messages.at(-1).id).toBe('in-1')
  })
})

describe('failure and retry', () => {
  it('marks a failed send, keeps the text, and retry delivers the same message id', async () => {
    const { result } = await setup()
    insertMessage.mockRejectedValueOnce(Object.assign(new Error("Can't reach the server."), { code: undefined }))
    await act(async () => { result.current.sendText('lost?') })
    const failed = result.current.messages.find((m) => m.id === 'uuid-1')
    expect(failed).toMatchObject({ failed: true, pending: false, content: 'lost?' })
    expect(failed.error).toMatch(/reach the server/)

    insertMessage.mockResolvedValueOnce(row('uuid-1', { sender_id: ME, content: 'lost?' }))
    await act(async () => { result.current.retry('uuid-1') })
    const ok = result.current.messages.find((m) => m.id === 'uuid-1')
    expect(ok.failed).toBeUndefined()
    expect(ok.pending).toBeUndefined()
    expect(insertMessage.mock.calls.map((c) => c[0].id)).toEqual(['uuid-1', 'uuid-1'])
    expect(result.current.messages.filter((m) => m.content === 'lost?')).toHaveLength(1)
  })

  it('treats "already exists" on retry as success (the first attempt landed, we lost the reply)', async () => {
    const { result } = await setup()
    insertMessage.mockRejectedValueOnce(new Error('timeout'))
    await act(async () => { result.current.sendText('once') })

    insertMessage.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }))
    fetchMessage.mockResolvedValueOnce(row('uuid-1', { sender_id: ME, content: 'once' }))
    await act(async () => { result.current.retry('uuid-1') })

    expect(fetchMessage).toHaveBeenCalledWith('uuid-1')
    const matches = result.current.messages.filter((m) => m.id === 'uuid-1')
    expect(matches).toHaveLength(1)
    expect(matches[0].failed).toBeUndefined()
  })

  it('discard removes a failed message', async () => {
    const { result } = await setup()
    insertMessage.mockRejectedValueOnce(new Error('nope'))
    await act(async () => { result.current.sendText('x') })
    act(() => result.current.discard('uuid-1'))
    expect(result.current.messages.find((m) => m.id === 'uuid-1')).toBeUndefined()
  })
})

describe('media', () => {
  it('uploads a photo once even if the insert has to be retried', async () => {
    const { result } = await setup()
    uploadChatMedia.mockResolvedValue(`${CONV}/p.jpg`)
    insertMessage.mockRejectedValueOnce(new Error('offline'))
    const blob = new Blob(['img'], { type: 'image/jpeg' })

    await act(async () => { result.current.sendImage({ blob, width: 800, height: 600, mime: 'image/jpeg' }, 'sunset') })
    const failed = result.current.messages.find((m) => m.id === 'uuid-1')
    expect(failed).toMatchObject({ failed: true, media_type: 'image', content: 'sunset', localUrl: 'blob:local' })

    insertMessage.mockResolvedValueOnce(row('uuid-1', { sender_id: ME, media_type: 'image', media_path: `${CONV}/p.jpg`, content: 'sunset' }))
    await act(async () => { result.current.retry('uuid-1') })

    expect(uploadChatMedia).toHaveBeenCalledTimes(1) // not re-uploaded on retry
    expect(insertMessage.mock.calls[1][0]).toMatchObject({
      media_type: 'image', media_path: `${CONV}/p.jpg`, media_mime: 'image/jpeg', media_width: 800, media_height: 600, content: 'sunset',
    })
    // the local preview survives the swap to the server copy, so the picture doesn't flash
    expect(result.current.messages.find((m) => m.id === 'uuid-1').localUrl).toBe('blob:local')
  })

  it('sends a voice note with its measured duration', async () => {
    const { result } = await setup()
    uploadChatMedia.mockResolvedValue(`${CONV}/v.webm`)
    insertMessage.mockResolvedValue(row('uuid-1', { sender_id: ME, media_type: 'audio', media_path: `${CONV}/v.webm`, media_duration_ms: 4200, content: '' }))
    await act(async () => { result.current.sendAudio({ blob: new Blob(['a']), mime: 'audio/webm', durationMs: 4200 }) })
    expect(uploadChatMedia).toHaveBeenCalledWith(CONV, expect.any(Blob), 'audio/webm')
    expect(insertMessage.mock.calls[0][0]).toMatchObject({ media_type: 'audio', media_mime: 'audio/webm', media_duration_ms: 4200, content: '', media_path: `${CONV}/v.webm` })
  })

  it('revokes local blob URLs when the chat closes', async () => {
    const { result, unmount } = await setup()
    uploadChatMedia.mockResolvedValue('p')
    insertMessage.mockResolvedValue(row('uuid-1', { sender_id: ME, media_type: 'image', media_path: 'p' }))
    await act(async () => { result.current.sendImage({ blob: new Blob(['i']), width: 1, height: 1, mime: 'image/jpeg' }) })
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local')
  })
})

describe('receipts arriving live', () => {
  it('turns a sent message into delivered, then read, as the server updates the row', async () => {
    const { result } = await setup([row('mine', { sender_id: ME })])
    expect(result.current.messages[0].delivered_at).toBeUndefined()
    act(() => channel.handlers[ON_UPDATE]({ new: row('mine', { sender_id: ME, delivered_at: '2026-01-01T10:00:05Z' }) }))
    expect(result.current.messages[0]).toMatchObject({ delivered_at: '2026-01-01T10:00:05Z' })
    expect(result.current.messages[0].read_at).toBeUndefined()
    act(() => channel.handlers[ON_UPDATE]({ new: row('mine', { sender_id: ME, delivered_at: '2026-01-01T10:00:05Z', read_at: '2026-01-01T10:01:00Z' }) }))
    expect(result.current.messages[0].read_at).toBe('2026-01-01T10:01:00Z')
    expect(result.current.messages).toHaveLength(1)
  })
  it("shows the other person's edit and delete", async () => {
    const { result } = await setup([row('theirs', { content: 'v1' })])
    act(() => channel.handlers[ON_UPDATE]({ new: row('theirs', { content: 'v2', edited_at: '2026-01-01T10:02:00Z' }) }))
    expect(result.current.messages[0]).toMatchObject({ content: 'v2', edited_at: '2026-01-01T10:02:00Z' })
    act(() => channel.handlers[ON_UPDATE]({ new: row('theirs', { content: null, deleted_at: '2026-01-01T10:03:00Z' }) }))
    expect(result.current.messages[0]).toMatchObject({ content: null, deleted_at: '2026-01-01T10:03:00Z' })
  })
})

describe('editing and deleting my messages', () => {
  const mine = () => row('mine', { sender_id: ME, content: 'original' })

  it('edit shows the new text immediately, then settles on the server copy', async () => {
    const { result } = await setup([mine()])
    let finish
    editMessage.mockReturnValueOnce(new Promise((r) => { finish = r }))
    let done
    act(() => { done = result.current.editMessage('mine', 'fixed') })
    expect(result.current.messages[0]).toMatchObject({ content: 'fixed' })
    expect(result.current.messages[0].edited_at).toBeTruthy()
    await act(async () => { finish(row('mine', { sender_id: ME, content: 'fixed', edited_at: '2026-01-01T10:05:00Z' })); await done })
    expect(result.current.messages[0]).toMatchObject({ content: 'fixed', edited_at: '2026-01-01T10:05:00Z' })
    expect(editMessage).toHaveBeenCalledWith('mine', 'fixed')
  })

  it('puts the old text back and reports why if the server refuses (e.g. window passed)', async () => {
    const { result } = await setup([mine()])
    editMessage.mockRejectedValueOnce(new Error('You can only edit a message within 15 minutes of sending it.'))
    await act(async () => {
      await expect(result.current.editMessage('mine', 'too late')).rejects.toThrow(/15 minutes/)
    })
    expect(result.current.messages[0]).toMatchObject({ content: 'original' })
    expect(result.current.messages[0].edited_at).toBeUndefined()
  })

  it('delete turns the bubble into a tombstone at once', async () => {
    const { result } = await setup([row('mine', { sender_id: ME, media_type: 'image', media_path: 'c/p.jpg', content: 'secret caption' })])
    deleteMessage.mockResolvedValueOnce()
    await act(async () => { await result.current.deleteMessage('mine') })
    expect(result.current.messages[0]).toMatchObject({ content: null, media_path: null })
    expect(result.current.messages[0].deleted_at).toBeTruthy()
    expect(deleteMessage).toHaveBeenCalledWith('mine')
  })

  it('brings the message back if deleting failed', async () => {
    const { result } = await setup([mine()])
    deleteMessage.mockRejectedValueOnce(new Error("Couldn't delete the message."))
    await act(async () => { await expect(result.current.deleteMessage('mine')).rejects.toThrow() })
    expect(result.current.messages[0]).toMatchObject({ content: 'original' })
    expect(result.current.messages[0].deleted_at).toBeUndefined()
  })
})

describe('delete for me', () => {
  const two = () => [row('a', { created_at: '2026-01-01T10:00:00Z' }), row('b', { created_at: '2026-01-01T10:01:00Z' })]

  it('removes the message at once and tells the server', async () => {
    const { result } = await setup(two())
    hideMessage.mockResolvedValueOnce()
    await act(async () => { await result.current.hideMessage('a') })
    expect(result.current.messages.map((m) => m.id)).toEqual(['b'])
    expect(hideMessage).toHaveBeenCalledWith('a')
  })

  it('works on my own messages and on tombstones too', async () => {
    const { result } = await setup([row('mine', { sender_id: ME }), row('gone', { deleted_at: '2026-01-01T10:00:00Z', content: null, created_at: '2026-01-01T10:01:00Z' })])
    hideMessage.mockResolvedValue()
    await act(async () => { await result.current.hideMessage('mine'); await result.current.hideMessage('gone') })
    expect(result.current.messages).toEqual([])
  })

  it('brings the message back, unchanged, if the server refuses', async () => {
    const { result } = await setup(two())
    hideMessage.mockRejectedValueOnce(new Error("Couldn't delete the message."))
    await act(async () => { await expect(result.current.hideMessage('a')).rejects.toThrow() })
    expect(result.current.messages.map((m) => m.id)).toEqual(['a', 'b'])
    // and it is no longer treated as hidden: live updates for it apply again
    act(() => channel.handlers[ON_UPDATE]({ new: row('a', { content: 'edited', created_at: '2026-01-01T10:00:00Z' }) }))
    expect(result.current.messages[0].content).toBe('edited')
  })

  it('does not let a late realtime echo resurrect it', async () => {
    const { result } = await setup(two())
    hideMessage.mockResolvedValueOnce()
    await act(async () => { await result.current.hideMessage('a') })
    act(() => channel.handlers[ON_UPDATE]({ new: row('a', { read_at: '2026-01-01T10:05:00Z', created_at: '2026-01-01T10:00:00Z' }) }))
    act(() => channel.handlers[ON_INSERT]({ new: row('a', { created_at: '2026-01-01T10:00:00Z' }) }))
    expect(result.current.messages.map((m) => m.id)).toEqual(['b'])
  })

  it('does not let a catch-up fetch after reconnecting bring it back either', async () => {
    const { result } = await setup(two())
    hideMessage.mockResolvedValueOnce()
    await act(async () => { await result.current.hideMessage('a') })
    fetchMessages.mockResolvedValueOnce({ messages: two(), hasMore: false })
    await act(async () => { channel.subscribeCb('SUBSCRIBED') })
    expect(result.current.messages.map((m) => m.id)).toEqual(['b'])
  })

  it('drops a message hidden from another tab of the same account, and ignores unrelated ones', async () => {
    const { result } = await setup(two())
    act(() => channel.handlers[ON_HIDDEN]({ new: { message_id: 'not-in-this-chat', user_id: ME } }))
    expect(result.current.messages).toHaveLength(2)
    act(() => channel.handlers[ON_HIDDEN]({ new: { message_id: 'b', user_id: ME } }))
    expect(result.current.messages.map((m) => m.id)).toEqual(['a'])
  })
})

describe('typing', () => {
  it('shows "typing" when the friend broadcasts it and clears it when they stop', async () => {
    const { result } = await setup()
    act(() => channel.handlers[ON_TYPING]({ payload: { userId: FRIEND, typing: true } }))
    expect(result.current.friendTyping).toBe(true)
    act(() => channel.handlers[ON_TYPING]({ payload: { userId: FRIEND, typing: false } }))
    expect(result.current.friendTyping).toBe(false)
  })
  it('gives up on a stale "typing" (their tab closed mid-sentence)', async () => {
    const { result } = await setup() // (real timers while loading; waitFor needs them)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    act(() => channel.handlers[ON_TYPING]({ payload: { userId: FRIEND, typing: true } }))
    expect(result.current.friendTyping).toBe(true)
    act(() => { vi.advanceTimersByTime(4900) })
    expect(result.current.friendTyping).toBe(true)
    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current.friendTyping).toBe(false)
  })
  it('stops showing it when their message actually arrives', async () => {
    const { result } = await setup()
    act(() => channel.handlers[ON_TYPING]({ payload: { userId: FRIEND, typing: true } }))
    act(() => channel.handlers[ON_INSERT]({ new: row('hi', { created_at: '2026-01-01T11:00:00Z' }) }))
    expect(result.current.friendTyping).toBe(false)
  })
  it('ignores my own echo', async () => {
    const { result } = await setup()
    act(() => channel.handlers[ON_TYPING]({ payload: { userId: ME, typing: true } }))
    expect(result.current.friendTyping).toBe(false)
  })
  it('broadcasts my typing on the conversation channel', async () => {
    const { result } = await setup()
    act(() => result.current.notifyTyping(true))
    expect(channel.send).toHaveBeenCalledWith({ type: 'broadcast', event: 'typing', payload: { userId: ME, typing: true } })
  })
})

describe('reconnecting', () => {
  it('never leaves a silent hole: after a long absence it shows the newest page and lets you load earlier', async () => {
    const { result } = await setup([row('old', { created_at: '2026-01-01T09:00:00Z' })])
    expect(result.current.hasMore).toBe(false)
    fetchMessages.mockResolvedValueOnce({ messages: [row('new1', { created_at: '2026-01-02T09:00:00Z' }), row('new2', { created_at: '2026-01-02T09:01:00Z' })], hasMore: true })
    await act(async () => { channel.subscribeCb('SUBSCRIBED') })
    expect(result.current.messages.map((m) => m.id)).toEqual(['new1', 'new2'])
    expect(result.current.hasMore).toBe(true)
  })

  it('fetches what it missed when the realtime channel re-subscribes', async () => {
    await setup()
    expect(fetchMessages).toHaveBeenCalledTimes(1)
    fetchMessages.mockResolvedValueOnce({ messages: [row('h1'), row('missed', { created_at: '2026-01-01T12:00:00Z' })], hasMore: false })
    await act(async () => { channel.subscribeCb('SUBSCRIBED') })
    expect(fetchMessages).toHaveBeenCalledTimes(2)
  })
})
