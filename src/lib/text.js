export const MAX_MESSAGE_LENGTH = 4000 // matches messages_shape_chk in migration 001

/** Insert `insert` at the caret/selection of `text`. Returns the new text and where the caret goes. */
export function insertAtCaret(text, start, end, insert) {
  const s = Math.max(0, Math.min(start ?? text.length, text.length))
  const e = Math.max(s, Math.min(end ?? s, text.length))
  const next = text.slice(0, s) + insert + text.slice(e)
  return { text: next, caret: s + insert.length }
}

/** Trim, and refuse empty or over-long messages. Returns the text to send or null. */
export function prepareText(raw) {
  const t = String(raw ?? '').trim()
  if (!t || t.length > MAX_MESSAGE_LENGTH) return null
  return t
}
