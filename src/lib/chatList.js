// Pure chat-list logic (sorting, applying realtime messages), kept apart from React for testing.

/** Latest activity first; friends you haven't talked to yet sort by name after that. */
export function sortChats(list) {
  return [...list].sort((a, b) => {
    const ta = a.last ? new Date(a.last.at).getTime() : -Infinity
    const tb = b.last ? new Date(b.last.at).getTime() : -Infinity
    if (ta !== tb) return tb - ta
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

/**
 * Applies a message that arrived over realtime to the chat list without a
 * round trip. Returns null when the conversation isn't known yet (caller
 * should refetch the whole list).
 */
export function applyIncomingMessage(chats, m, { userId, isActiveAndVisible }) {
  const i = chats.findIndex((c) => c.conversationId === m.conversation_id)
  if (i < 0) return null
  const chat = chats[i]
  if (chat.last?.id === m.id) return chats // already applied (e.g. our own optimistic echo)
  const mine = m.sender_id === userId
  const next = {
    ...chat,
    last: {
      id: m.id, type: m.media_type, content: m.content, senderId: m.sender_id,
      durationMs: m.media_duration_ms, at: m.created_at, deleted: Boolean(m.deleted_at),
    },
    unread: mine || isActiveAndVisible ? chat.unread : chat.unread + 1,
  }
  return sortChats(chats.map((c, idx) => (idx === i ? next : c)))
}

/**
 * A message changed (edited, deleted, or just got a receipt). Only the chat-list preview
 * cares, and only if it's the latest message of a chat. Returns the same array when
 * nothing visible changed so React can skip re-rendering.
 */
export function applyMessageUpdate(chats, m) {
  const i = chats.findIndex((c) => c.last?.id === m.id)
  if (i < 0) return chats
  const last = chats[i].last
  const deleted = Boolean(m.deleted_at)
  if (last.deleted === deleted && last.content === m.content) return chats
  return chats.map((c, idx) => (idx === i ? { ...c, last: { ...last, content: m.content, deleted } } : c))
}
