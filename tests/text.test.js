import { describe, it, expect } from 'vitest'
import { insertAtCaret, prepareText, MAX_MESSAGE_LENGTH } from '../src/lib/text.js'

describe('insertAtCaret', () => {
  it('inserts in the middle and moves the caret after the insert', () => {
    expect(insertAtCaret('helloworld', 5, 5, ' 😀 ')).toEqual({ text: 'hello 😀 world', caret: 9 })
  })
  it('replaces a selection', () => {
    expect(insertAtCaret('hello world', 6, 11, '🌍')).toEqual({ text: 'hello 🌍', caret: 8 })
  })
  it('appends when the caret is unknown, and clamps out-of-range carets', () => {
    expect(insertAtCaret('hi', undefined, undefined, '!').text).toBe('hi!')
    expect(insertAtCaret('hi', 99, 120, '!').text).toBe('hi!')
    expect(insertAtCaret('hi', -5, -1, '!').text).toBe('!hi')
  })
  it('works on empty text', () => {
    expect(insertAtCaret('', 0, 0, '😀')).toEqual({ text: '😀', caret: 2 })
  })
})

describe('prepareText', () => {
  it('trims and rejects blank input', () => {
    expect(prepareText('  hi  ')).toBe('hi')
    expect(prepareText('   \n ')).toBeNull()
    expect(prepareText(undefined)).toBeNull()
  })
  it('keeps inner newlines', () => {
    expect(prepareText('a\n\nb')).toBe('a\n\nb')
  })
  it('rejects text over the server limit', () => {
    expect(prepareText('x'.repeat(MAX_MESSAGE_LENGTH))).not.toBeNull()
    expect(prepareText('x'.repeat(MAX_MESSAGE_LENGTH + 1))).toBeNull()
  })
})
