// Pure formatting helpers (no DOM, no Supabase) so they are easy to test.

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const DAY = 24 * 60 * 60 * 1000
const dayDiff = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY)

export function formatClock(date, locale) {
  return new Date(date).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

/** Right-hand timestamp in the chat list: 14:05 / Yesterday / Mon / 24/11/2026 */
export function formatListTime(date, now = new Date(), locale) {
  const d = new Date(date)
  const diff = dayDiff(d, now)
  if (diff <= 0) return formatClock(d, locale)
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return d.toLocaleDateString(locale, { weekday: 'short' })
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Day separator inside a conversation: Today / Yesterday / Mon, 24 Nov / 24 Nov 2025 */
export function formatDayLabel(date, now = new Date(), locale) {
  const d = new Date(date)
  const diff = dayDiff(d, now)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
  }
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** 4200 -> "0:04", 65000 -> "1:05" */
export function formatDuration(ms) {
  const total = Math.max(0, Math.round((ms || 0) / 1000))
  const m = Math.floor(total / 60)
  const s = String(total % 60).padStart(2, '0')
  return `${m}:${s}`
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return [...parts[0]][0].toUpperCase()
  return ([...parts[0]][0] + [...parts[parts.length - 1]][0]).toUpperCase()
}

// Stable pastel-ish colour per person so avatars are recognisable at a glance.
const AVATAR_COLORS = [
  'bg-rose-100 text-rose-700', 'bg-orange-100 text-orange-700', 'bg-amber-100 text-amber-700',
  'bg-lime-100 text-lime-700', 'bg-emerald-100 text-emerald-700', 'bg-teal-100 text-teal-700',
  'bg-sky-100 text-sky-700', 'bg-indigo-100 text-indigo-700', 'bg-violet-100 text-violet-700',
  'bg-fuchsia-100 text-fuchsia-700',
]
export function avatarColor(key) {
  let h = 0
  for (const ch of String(key || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u

/** "😀🎉" -> 2, "hi 😀" -> 0 (only counts when the text is *nothing but* emoji). */
export function emojiOnlyCount(text) {
  const t = String(text || '').trim()
  if (!t) return 0
  const graphemes = segmenter ? [...segmenter.segment(t)].map((s) => s.segment) : [...t]
  let n = 0
  for (const g of graphemes) {
    if (/^\s+$/.test(g)) continue
    if (!EMOJI_RE.test(g)) return 0
    n += 1
  }
  return n
}
/** WhatsApp-style: 1-3 emoji and nothing else are shown big, without a bubble. */
export const isBigEmoji = (text) => {
  const n = emojiOnlyCount(text)
  return n >= 1 && n <= 3
}

/** One-line summary of a message for the chat list. */
export function messagePreview(m) {
  if (!m) return ''
  if (m.type === 'image') return m.content ? `📷 ${m.content}` : '📷 Photo'
  if (m.type === 'audio') return `🎤 Voice message${m.durationMs ? ` (${formatDuration(m.durationMs)})` : ''}`
  return m.content || ''
}
