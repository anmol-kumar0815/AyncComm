// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const channel = { handlers: [], subscribeCb: null }
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on(_type, _filter, cb) { channel.handlers.push(cb); return this },
      subscribe(cb) { channel.subscribeCb = cb; cb('SUBSCRIBED'); return this },
    })),
    removeChannel: vi.fn(),
  },
}))
vi.mock('../src/lib/api/messages', () => ({
  fetchMessages: vi.fn(),
  insertMessage: vi.fn(),
  uploadChatMedia: vi.fn(),
  fetchMessage: vi.fn(),
}))

import { useMessages } from '../src/hooks/useMessages.js'
import { fetchMessage, fetchMessages, insertMessage, uploadChatMedia } from '../src/lib/api/messages'

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

beforeEach(() => {
  vi.clearAllMocks()
  channel.handlers = []
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
    act(() => { channel.handlers[0]({ new: server }) }) // echo wins the race
    await act(async () => { d.resolve(server) })

    expect(result.current.messages.filter((m) => m.id === 'uuid-1')).toHaveLength(1)
    expect(result.current.messages.find((m) => m.id === 'uuid-1').pending).toBeUndefined()
  })

  it('shows messages from the other person as they arrive', async () => {
    const { result } = await setup()
    act(() => { channel.handlers[0]({ new: row('in-1', { created_at: '2026-01-01T11:00:00Z' }) }) })
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
