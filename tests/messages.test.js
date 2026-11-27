import { describe, it, expect } from 'vitest'
import { mergeMessages, buildTimeline, mergeCatchUp } from '../src/lib/messages.js'

const msg = (id, iso, sender = 'a', extra = {}) => ({ id, created_at: iso, sender_id: sender, content: id, ...extra })

describe('mergeMessages', () => {
  it('orders by time then id and does not mutate inputs', () => {
    const existing = [msg('2', '2026-01-01T10:00:02Z')]
    const out = mergeMessages(existing, [msg('1', '2026-01-01T10:00:01Z'), msg('3', '2026-01-01T10:00:03Z')])
    expect(out.map((m) => m.id)).toEqual(['1', '2', '3'])
    expect(existing).toHaveLength(1)
  })
  it('de-duplicates the realtime echo of a message we already added optimistically', () => {
    const pending = msg('x', '2026-01-01T10:00:00Z', 'a', { pending: true })
    const server = msg('x', '2026-01-01T10:00:00.5Z', 'a')
    const out = mergeMessages([pending], [server])
    expect(out).toHaveLength(1)
    expect(out[0].pending).toBeUndefined()
    expect(out[0].created_at).toBe('2026-01-01T10:00:00.5Z') // server timestamp wins
  })
  it('never downgrades a confirmed message back to pending/failed', () => {
    const server = msg('x', '2026-01-01T10:00:00Z')
    expect(mergeMessages([server], [{ ...server, pending: true }])[0].pending).toBeUndefined()
    expect(mergeMessages([server], [{ ...server, failed: true }])[0].failed).toBeUndefined()
  })
  it('keeps the local blob preview when the server copy arrives', () => {
    const local = msg('x', '2026-01-01T10:00:00Z', 'a', { pending: true, localUrl: 'blob:1' })
    expect(mergeMessages([local], [msg('x', '2026-01-01T10:00:01Z')])[0].localUrl).toBe('blob:1')
  })
  it('lets a retry replace a failed copy', () => {
    const failed = msg('x', '2026-01-01T10:00:00Z', 'a', { failed: true })
    const out = mergeMessages([failed], [msg('x', '2026-01-01T10:00:05Z', 'a', { pending: true })])
    expect(out[0].failed).toBeUndefined()
    expect(out[0].pending).toBe(true)
  })
})

describe('buildTimeline', () => {
  it('inserts a day separator per day and marks sender runs', () => {
    const list = [
      msg('1', '2026-01-01T10:00:00', 'a'),
      msg('2', '2026-01-01T10:01:00', 'a'),
      msg('3', '2026-01-01T10:02:00', 'b'),
      msg('4', '2026-01-02T09:00:00', 'b'), // same sender, new day => new run
    ]
    const t = buildTimeline(list)
    expect(t.map((x) => x.kind)).toEqual(['day', 'message', 'message', 'message', 'day', 'message'])
    const m = t.filter((x) => x.kind === 'message')
    expect(m.map((x) => [x.startsRun, x.endsRun])).toEqual([[true, false], [false, true], [true, true], [true, true]])
  })
  it('handles an empty list', () => {
    expect(buildTimeline([])).toEqual([])
  })
})

describe('mergeCatchUp', () => {
  const at = (n) => `2026-01-01T10:00:${String(n).padStart(2, '0')}Z`

  it('is a plain merge when the new page overlaps what we have', () => {
    const existing = [msg('1', at(1)), msg('2', at(2))]
    const out = mergeCatchUp(existing, [msg('2', at(2)), msg('3', at(3))], true)
    expect(out.messages.map((m) => m.id)).toEqual(['1', '2', '3'])
    expect(out.hasMore).toBeNull() // leave "load earlier" as it was
  })

  it('is a plain merge when the whole conversation fits in the page', () => {
    const out = mergeCatchUp([msg('1', at(1))], [msg('2', at(2))], false)
    expect(out.messages.map((m) => m.id)).toEqual(['1', '2'])
  })

  it('drops stale history when the page does not reach back to it (we missed a lot)', () => {
    const existing = [msg('old1', at(1)), msg('old2', at(2))]
    const out = mergeCatchUp(existing, [msg('new1', at(50)), msg('new2', at(51))], true)
    expect(out.messages.map((m) => m.id)).toEqual(['new1', 'new2']) // no silent hole
    expect(out.hasMore).toBe(true) // "Load earlier" will fill it in order
  })

  it('keeps messages we are still sending or that failed, through a gap', () => {
    const existing = [msg('old', at(1)), msg('mine', at(2), 'me', { pending: true }), msg('bad', at(3), 'me', { failed: true })]
    const out = mergeCatchUp(existing, [msg('new', at(50))], true)
    expect(out.messages.map((m) => m.id).sort()).toEqual(['bad', 'mine', 'new'])
  })

  it('works from an empty list', () => {
    expect(mergeCatchUp([], [msg('1', at(1))], true).messages).toHaveLength(1)
  })
})
