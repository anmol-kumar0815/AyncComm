import { describe, it, expect } from 'vitest'
import { canDelete, canEdit, editMinutesLeft, EDIT_WINDOW_MS, receiptState } from '../src/lib/receipts.js'
import { formatDateTime, formatLastSeen, presenceLabel, messagePreview } from '../src/lib/format.js'
import { applyMessageUpdate } from '../src/lib/chatList.js'
import { friendlyError } from '../src/lib/api/errors.js'

const now = new Date(2026, 10, 27, 15, 0).getTime()
const msg = (over = {}) => ({ id: 'm', sender_id: 'me', media_type: 'text', created_at: new Date(now - 60_000).toISOString(), ...over })

describe('receiptState', () => {
  it('walks sent -> delivered -> read', () => {
    expect(receiptState(msg())).toBe('sent')
    expect(receiptState(msg({ delivered_at: 'x' }))).toBe('delivered')
    expect(receiptState(msg({ delivered_at: 'x', read_at: 'y' }))).toBe('read')
  })
  it('read wins even if delivered_at is missing (read implies delivered)', () => {
    expect(receiptState(msg({ read_at: 'y' }))).toBe('read')
  })
  it('local states beat server states', () => {
    expect(receiptState(msg({ pending: true }))).toBe('pending')
    expect(receiptState(msg({ failed: true, read_at: 'y' }))).toBe('failed')
  })
})

describe('canEdit / canDelete', () => {
  it('allows editing your own recent text message', () => {
    expect(canEdit(msg(), 'me', now)).toBe(true)
  })
  it('stops exactly at the 15-minute window', () => {
    expect(canEdit(msg({ created_at: new Date(now - EDIT_WINDOW_MS + 1000).toISOString() }), 'me', now)).toBe(true)
    expect(canEdit(msg({ created_at: new Date(now - EDIT_WINDOW_MS).toISOString() }), 'me', now)).toBe(false)
  })
  it("never lets you edit someone else's, media, deleted or unsent messages", () => {
    expect(canEdit(msg({ sender_id: 'them' }), 'me', now)).toBe(false)
    expect(canEdit(msg({ media_type: 'image' }), 'me', now)).toBe(false)
    expect(canEdit(msg({ media_type: 'audio' }), 'me', now)).toBe(false)
    expect(canEdit(msg({ deleted_at: 'x' }), 'me', now)).toBe(false)
    expect(canEdit(msg({ pending: true }), 'me', now)).toBe(false)
    expect(canEdit(msg({ failed: true }), 'me', now)).toBe(false)
  })
  it('lets you delete any of your own settled messages, at any age', () => {
    expect(canDelete(msg({ created_at: '2020-01-01T00:00:00Z', media_type: 'image' }), 'me')).toBe(true)
    expect(canDelete(msg({ sender_id: 'them' }), 'me')).toBe(false)
    expect(canDelete(msg({ deleted_at: 'x' }), 'me')).toBe(false)
    expect(canDelete(msg({ pending: true }), 'me')).toBe(false)
  })
  it('reports minutes left, never 0 while still editable', () => {
    expect(editMinutesLeft(msg({ created_at: new Date(now - 60_000).toISOString() }), now)).toBe(14)
    expect(editMinutesLeft(msg({ created_at: new Date(now - EDIT_WINDOW_MS + 5_000).toISOString() }), now)).toBe(1)
    expect(editMinutesLeft(msg({ created_at: new Date(now - EDIT_WINDOW_MS - 1).toISOString() }), now)).toBe(0)
  })
})

describe('last seen and presence text', () => {
  const at = (...a) => new Date(...a)
  const n = at(2026, 10, 27, 15, 0)
  it('formats today, yesterday, this week and older', () => {
    expect(formatLastSeen(at(2026, 10, 27, 9, 5), n, 'en-GB')).toBe('last seen today at 09:05')
    expect(formatLastSeen(at(2026, 10, 26, 23, 59), n, 'en-GB')).toBe('last seen yesterday at 23:59')
    expect(formatLastSeen(at(2026, 10, 24, 8, 0), n, 'en-GB')).toBe('last seen Tue at 08:00')
    expect(formatLastSeen(at(2026, 9, 1, 8, 0), n, 'en-GB')).toBe('last seen 01/10/2026')
  })
  it('says nothing when it was never seen', () => {
    expect(formatLastSeen(null, n)).toBe('')
  })
  it('typing beats online beats last seen', () => {
    const lastSeenAt = at(2026, 10, 27, 9, 5)
    expect(presenceLabel({ typing: true, online: true, lastSeenAt }, n)).toEqual({ text: 'typing…', tone: 'typing' })
    expect(presenceLabel({ typing: false, online: true, lastSeenAt }, n)).toEqual({ text: 'online', tone: 'online' })
    expect(presenceLabel({ lastSeenAt }, n, 'en-GB')).toEqual({ text: 'last seen today at 09:05', tone: 'muted' })
  })
  it('formats exact moments for message info', () => {
    expect(formatDateTime(at(2026, 10, 27, 14, 5), n, 'en-GB')).toBe('Today at 14:05')
    expect(formatDateTime(at(2026, 10, 26, 14, 5), n, 'en-GB')).toBe('Yesterday at 14:05')
  })
})

describe('deleted messages in lists', () => {
  it('previews a deleted message without its old content', () => {
    expect(messagePreview({ type: 'image', content: 'secret', deleted: true })).toBe('🚫 This message was deleted')
  })
  const chats = [{ friendId: 'a', last: { id: 'm1', content: 'old', deleted: false } }, { friendId: 'b', last: { id: 'm2', content: 'x', deleted: false } }]
  it('applies an edit to the preview of the latest message', () => {
    const out = applyMessageUpdate(chats, { id: 'm1', content: 'new', deleted_at: null })
    expect(out[0].last.content).toBe('new')
    expect(out[1]).toBe(chats[1])
  })
  it('applies a delete', () => {
    expect(applyMessageUpdate(chats, { id: 'm2', content: null, deleted_at: 'x' })[1].last).toMatchObject({ deleted: true, content: null })
  })
  it('returns the very same array for receipt-only updates and unrelated messages (no re-render)', () => {
    expect(applyMessageUpdate(chats, { id: 'm1', content: 'old', deleted_at: null, read_at: 'now' })).toBe(chats)
    expect(applyMessageUpdate(chats, { id: 'older', content: 'z', deleted_at: null })).toBe(chats)
  })
})

describe('friendlyError for unknown problems', () => {
  it('keeps the friendly sentence but shows what the server said, so it can be diagnosed', () => {
    const text = friendlyError({ code: 'unexpected_failure', message: 'Database error saving new user' })
    expect(text).toMatch(/^Something went wrong\. Please try again\./)
    expect(text).toContain('unexpected_failure: Database error saving new user')
  })
  it('works with only a message, or nothing', () => {
    expect(friendlyError({ message: 'boom' })).toContain('(boom)')
    expect(friendlyError({})).toBe('Something went wrong. Please try again.')
    expect(friendlyError(null)).toBe('Something went wrong. Please try again.')
  })
  it('caps very long server messages', () => {
    expect(friendlyError({ message: 'x'.repeat(1000) }).length).toBeLessThan(300)
  })
  it('does not add detail to errors we already explain', () => {
    expect(friendlyError({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe("That email and password don't match.")
  })
})

describe('friendlyError for existing accounts', () => {
  it('tells someone signing up with a taken email to sign in instead', () => {
    expect(friendlyError({ code: 'user_already_exists', message: 'User already registered' })).toMatch(/already exists.*sign in/i)
    expect(friendlyError({ message: 'User already registered' })).toMatch(/already exists/i)
  })
})

describe('friendlyError when the Email provider is off in Supabase', () => {
  it('says what to switch on instead of a vague failure (both sign-up and sign-in variants)', () => {
    expect(friendlyError({ code: 'email_provider_disabled', message: 'Email signups are disabled' })).toMatch(/turn on the Email provider/)
    expect(friendlyError({ message: 'Email logins are disabled' })).toMatch(/turn on the Email provider/)
  })
})

describe('friendlyError for closed signups', () => {
  it('explains that the app is invite-only instead of a vague failure', () => {
    expect(friendlyError({ code: 'signup_disabled', message: 'Signups not allowed for this instance' })).toMatch(/invite-only/)
    expect(friendlyError({ message: 'Signups not allowed for otp' })).toMatch(/invite-only/)
  })
})

describe('friendlyError for message functions', () => {
  it.each([
    ['edit_window_passed', /15 minutes/],
    ['not_editable', /can't be edited/],
    ['message_not_found', /no longer exists/],
    ['invalid_content', /1 and 4000/],
  ])('%s', (message, re) => {
    expect(friendlyError({ message })).toMatch(re)
  })
})
