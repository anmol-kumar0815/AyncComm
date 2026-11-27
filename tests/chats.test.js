import { describe, it, expect } from 'vitest'
import { applyIncomingMessage, sortChats } from '../src/lib/chatList.js'

const chat = (name, convId, at, unread = 0) => ({
  friendId: name, name, conversationId: convId, unread,
  last: at ? { id: `m-${name}`, type: 'text', content: 'x', senderId: 'f', durationMs: null, at } : null,
})
const incoming = (conv, sender, id = 'new', at = '2026-01-02T00:00:00Z') => ({
  id, conversation_id: conv, sender_id: sender, content: 'hey', media_type: 'text', media_duration_ms: null, created_at: at,
})

describe('sortChats', () => {
  it('puts latest activity first, then silent friends alphabetically', () => {
    const out = sortChats([chat('Zed', null), chat('Amy', null), chat('Old', 'c1', '2026-01-01T00:00:00Z'), chat('New', 'c2', '2026-01-02T00:00:00Z')])
    expect(out.map((c) => c.name)).toEqual(['New', 'Old', 'Amy', 'Zed'])
  })
})

describe('applyIncomingMessage', () => {
  const base = [chat('Amy', 'c1', '2026-01-01T00:00:00Z'), chat('Bob', 'c2', '2026-01-01T12:00:00Z')]
  const ctx = { userId: 'me', isActiveAndVisible: false }

  it('bumps unread and moves the chat to the top', () => {
    const out = applyIncomingMessage(base, incoming('c1', 'amy-id'), ctx)
    expect(out[0].name).toBe('Amy')
    expect(out[0].unread).toBe(1)
    expect(out[0].last.id).toBe('new')
  })
  it('does not count my own messages, or messages in the chat I am looking at', () => {
    expect(applyIncomingMessage(base, incoming('c1', 'me'), ctx)[0].unread).toBe(0)
    expect(applyIncomingMessage(base, incoming('c1', 'amy-id'), { ...ctx, isActiveAndVisible: true })[0].unread).toBe(0)
  })
  it('is idempotent for a message it has already applied', () => {
    const once = applyIncomingMessage(base, incoming('c1', 'amy-id'), ctx)
    const twice = applyIncomingMessage(once, incoming('c1', 'amy-id'), ctx)
    expect(twice[0].unread).toBe(1)
  })
  it('returns null for an unknown conversation so the caller refetches', () => {
    expect(applyIncomingMessage(base, incoming('c9', 'x'), ctx)).toBeNull()
  })
  it('does not mutate the previous list', () => {
    const snapshot = JSON.stringify(base)
    applyIncomingMessage(base, incoming('c1', 'amy-id'), ctx)
    expect(JSON.stringify(base)).toBe(snapshot)
  })
})
