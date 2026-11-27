import { describe, it, expect } from 'vitest'
import { wantsPerTabSession } from '../src/lib/devSession.js'

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } }

describe('wantsPerTabSession', () => {
  it('is off for a normal tab', () => {
    expect(wantsPerTabSession({ search: '', storage: memory() })).toBe(false)
  })
  it('turns on for ?as=<user> (and ?as=none) and stays on after the param is gone', () => {
    const storage = memory()
    expect(wantsPerTabSession({ search: '?as=alice', storage })).toBe(true)
    expect(wantsPerTabSession({ search: '', storage })).toBe(true) // e.g. after navigating to /chat/x or reloading
    expect(wantsPerTabSession({ search: '?as=none', storage: memory() })).toBe(true)
  })
  it('does not leak into another tab (separate sessionStorage)', () => {
    wantsPerTabSession({ search: '?as=bob', storage: memory() })
    expect(wantsPerTabSession({ search: '', storage: memory() })).toBe(false)
  })
})
