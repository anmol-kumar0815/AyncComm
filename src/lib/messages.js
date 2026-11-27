// Pure message-list logic: merging server/optimistic/realtime copies of the
// same message, and shaping the list for display.

const byTime = (a, b) => {
  const t = new Date(a.created_at) - new Date(b.created_at)
  if (t !== 0) return t
  return String(a.id).localeCompare(String(b.id))
}

/**
 * Merge `incoming` into `existing`, de-duplicating by id (incoming wins, but a
 * confirmed server copy is never downgraded back to a pending one) and keeping
 * chronological order. Never mutates its arguments.
 */
export function mergeMessages(existing, incoming) {
  const map = new Map(existing.map((m) => [m.id, m]))
  for (const m of incoming) {
    const prev = map.get(m.id)
    if (prev && !prev.pending && !prev.failed && (m.pending || m.failed)) continue
    // keep the local blob preview URL so a just-sent image doesn't flicker
    map.set(m.id, prev?.localUrl && !m.localUrl ? { ...m, localUrl: prev.localUrl } : m)
  }
  return [...map.values()].sort(byTime)
}

/**
 * Annotate a chronological list with what the UI needs to render it:
 * day separators and whether a bubble starts/ends a run by the same sender.
 * Returns [{ kind:'day', key, date } | { kind:'message', key, message, startsRun, endsRun }]
 */
export function buildTimeline(messages) {
  const out = []
  let lastDay = null
  messages.forEach((m, i) => {
    const d = new Date(m.created_at)
    const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (day !== lastDay) {
      out.push({ kind: 'day', key: `day-${day}`, date: d })
      lastDay = day
    }
    const prev = messages[i - 1]
    const next = messages[i + 1]
    const sameDay = (x) => x && new Date(x.created_at).toDateString() === d.toDateString()
    out.push({
      kind: 'message',
      key: m.id,
      message: m,
      startsRun: !(prev && prev.sender_id === m.sender_id && sameDay(prev)),
      endsRun: !(next && next.sender_id === m.sender_id && sameDay(next)),
    })
  })
  return out
}

/**
 * Fold the freshly fetched newest page into what we already show.
 *
 * Normally that's a plain merge. But if we were away long enough that the
 * newest page doesn't reach back to our newest known message (there's a hole
 * between them), merging would show a conversation with missing messages and
 * no way to fetch them. In that case we drop the stale history and keep only
 * the new page (plus unsent local messages) so "Load earlier" fills the gap
 * contiguously. Returns { messages, hasMore } where hasMore is set only when a
 * gap was cut, otherwise null (leave the existing value alone).
 */
export function mergeCatchUp(existing, page, pageHasMore) {
  const confirmed = existing.filter((m) => !m.pending && !m.failed)
  const newestKnown = confirmed.at(-1)
  const oldestInPage = page[0]
  const hasGap =
    pageHasMore && newestKnown && oldestInPage &&
    new Date(oldestInPage.created_at) > new Date(newestKnown.created_at)
  if (!hasGap) return { messages: mergeMessages(existing, page), hasMore: null }
  return { messages: mergeMessages(existing.filter((m) => m.pending || m.failed), page), hasMore: true }
}
