import { describe, it, expect } from 'vitest'
import { formatClock, formatListTime, formatDayLabel, formatDuration, initials, emojiOnlyCount, isBigEmoji, messagePreview, avatarColor } from '../src/lib/format.js'

const now = new Date(2026, 10, 27, 15, 0) // Fri 27 Nov 2026, 3:00 PM local
// AM/PM casing and the space before it vary by locale/ICU version (newer ICU uses a narrow no-break space)
const t = (s) => s.replace(/\s+/g, ' ').toLowerCase()

describe('formatDuration', () => {
  it.each([[0, '0:00'], [4200, '0:04'], [4600, '0:05'], [65000, '1:05'], [600000, '10:00'], [undefined, '0:00'], [-5, '0:00']])('%s -> %s', (ms, out) => {
    expect(formatDuration(ms)).toBe(out)
  })
})

describe('formatClock: 12-hour everywhere', () => {
  const at = (h, m) => new Date(2026, 10, 27, h, m)
  it.each([
    [0, 5, '12:05 am'], [9, 5, '9:05 am'], [12, 0, '12:00 pm'], [13, 0, '1:00 pm'], [14, 5, '2:05 pm'], [23, 59, '11:59 pm'],
  ])('%i:%i -> %s (midnight is 12 AM, noon is 12 PM, no leading zero)', (h, m, out) => {
    expect(t(formatClock(at(h, m), 'en-US'))).toBe(out)
    expect(t(formatClock(at(h, m), 'en-GB'))).toBe(out) // locales that default to 24-hour still get 12-hour
  })
  it('is 12-hour even with the device default locale, and for 24-hour locales like German or French', () => {
    for (const locale of [undefined, 'de-DE', 'fr-FR', 'ja-JP']) {
      expect(formatClock(at(14, 5), locale), String(locale)).toMatch(/(am|pm|AM|PM|午後|午前)/)
      expect(formatClock(at(14, 5), locale)).not.toMatch(/\b14[:.]05\b/)
    }
  })
})

describe('formatListTime', () => {
  it('shows a clock for today (even just after midnight)', () => {
    expect(t(formatListTime(new Date(2026, 10, 27, 0, 5), now, 'en-GB'))).toBe('12:05 am')
  })
  it('says Yesterday across midnight, not "24h ago"', () => {
    expect(formatListTime(new Date(2026, 10, 26, 23, 59), now, 'en-GB')).toBe('Yesterday')
  })
  it('uses the weekday within the last week', () => {
    expect(formatListTime(new Date(2026, 10, 24, 9, 0), now, 'en-GB')).toBe('Tue')
  })
  it('falls back to a date after a week', () => {
    expect(formatListTime(new Date(2026, 10, 1, 9, 0), now, 'en-GB')).toBe('01/11/2026')
  })
})

describe('formatDayLabel', () => {
  it('labels today, yesterday, this year, other years', () => {
    expect(formatDayLabel(new Date(2026, 10, 27, 1), now, 'en-GB')).toBe('Today')
    expect(formatDayLabel(new Date(2026, 10, 26, 23), now, 'en-GB')).toBe('Yesterday')
    expect(formatDayLabel(new Date(2026, 9, 3), now, 'en-GB')).toMatch(/^Sat,? 3 Oct$/) // comma depends on ICU version
    expect(formatDayLabel(new Date(2025, 9, 3), now, 'en-GB')).toBe('3 Oct 2025')
  })
})

describe('initials / avatarColor', () => {
  it('handles one word, two words, extra spaces, empty and emoji', () => {
    expect(initials('alice')).toBe('A')
    expect(initials('Alice Wonderland')).toBe('AW')
    expect(initials('  bob   the  builder ')).toBe('BB')
    expect(initials('')).toBe('?')
    expect(initials(null)).toBe('?')
    expect(initials('😀 Smile')).toBe('😀S')
  })
  it('is stable per key', () => {
    expect(avatarColor('a@x.com')).toBe(avatarColor('a@x.com'))
    expect(avatarColor('a@x.com')).toMatch(/^bg-/)
  })
})

describe('emoji-only detection', () => {
  it('counts emoji including ZWJ sequences, skin tones and flags as one each', () => {
    expect(emojiOnlyCount('😀')).toBe(1)
    expect(emojiOnlyCount('😀🎉')).toBe(2)
    expect(emojiOnlyCount('👨‍👩‍👧')).toBe(1)
    expect(emojiOnlyCount('👍🏽')).toBe(1)
    expect(emojiOnlyCount('🇮🇳')).toBe(1)
    expect(emojiOnlyCount(' 😀  😀 ')).toBe(2)
  })
  it('returns 0 as soon as any real text is present', () => {
    expect(emojiOnlyCount('hi 😀')).toBe(0)
    expect(emojiOnlyCount('1')).toBe(0)
    expect(emojiOnlyCount('')).toBe(0)
  })
  it('only makes 1-3 emoji big', () => {
    expect(isBigEmoji('😀😀😀')).toBe(true)
    expect(isBigEmoji('😀😀😀😀')).toBe(false)
    expect(isBigEmoji('ok')).toBe(false)
  })
})

describe('messagePreview', () => {
  it('describes each message type', () => {
    expect(messagePreview({ type: 'text', content: 'hello' })).toBe('hello')
    expect(messagePreview({ type: 'image', content: '' })).toBe('📷 Photo')
    expect(messagePreview({ type: 'image', content: 'sunset' })).toBe('📷 sunset')
    expect(messagePreview({ type: 'audio', durationMs: 65000 })).toBe('🎤 Voice message (1:05)')
    expect(messagePreview(null)).toBe('')
  })
})
