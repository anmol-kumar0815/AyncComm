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
