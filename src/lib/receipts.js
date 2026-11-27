// What state is a message in, and what can its sender still do with it? (Pure; unit-tested.)

/** Must match the 15-minute window enforced in edit_message (migration 004). */
export const EDIT_WINDOW_MS = 15 * 60 * 1000

/**
 * failed | pending | sent | delivered | read
 *  sent      = saved on the server (one tick)
 *  delivered = the recipient's app received it (two ticks)
 *  read      = the recipient opened the chat (two coloured ticks)
 */
export function receiptState(m) {
  if (m.failed) return 'failed'
  if (m.pending) return 'pending'
  if (m.read_at) return 'read'
  if (m.delivered_at) return 'delivered'
  return 'sent'
}

const isSettled = (m) => !m.pending && !m.failed && !m.deleted_at

export function canEdit(m, meId, now = Date.now()) {
  return m.sender_id === meId && isSettled(m) && m.media_type === 'text' && now - new Date(m.created_at).getTime() < EDIT_WINDOW_MS
}

/** Delete for me works on any message that has actually been sent (yours, theirs, or a "deleted" tombstone). */
export const canHide = (m) => !m.pending && !m.failed

/** Delete for everyone: only the sender, and only while it isn't already deleted. */
export const canDelete = (m, meId) => m.sender_id === meId && isSettled(m)

/** Whole minutes left to edit (at least 1 while editing is still possible), else 0. */
export function editMinutesLeft(m, now = Date.now()) {
  const left = EDIT_WINDOW_MS - (now - new Date(m.created_at).getTime())
  return left > 0 ? Math.max(1, Math.ceil(left / 60000)) : 0
}
