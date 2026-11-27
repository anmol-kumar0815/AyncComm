// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { clearUnlocked, isLockEnabled, isUnlocked, markUnlocked, needsUnlock, setLockEnabled } from '../src/lib/appLock.js'

beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

describe('app lock storage', () => {
  it('is off by default, so nobody is locked out of an existing install', () => {
    expect(isLockEnabled('u1')).toBe(false)
    expect(needsUnlock('u1')).toBe(false)
  })

  it('needs a password once turned on, until this tab is unlocked', () => {
    setLockEnabled('u1', true)
    expect(needsUnlock('u1')).toBe(true)
    markUnlocked('u1')
    expect(needsUnlock('u1')).toBe(false)
  })

  it('belongs to one user on this device: another account is unaffected', () => {
    setLockEnabled('u1', true)
    expect(isLockEnabled('u2')).toBe(false)
    markUnlocked('u1')
    expect(isUnlocked('u2')).toBe(false) // one person unlocking doesn't unlock the next
  })

  it('the setting survives a closed tab, but "unlocked" does not (it lives in sessionStorage)', () => {
    setLockEnabled('u1', true)
    markUnlocked('u1')
    sessionStorage.clear() // what closing the tab does
    expect(isLockEnabled('u1')).toBe(true)
    expect(needsUnlock('u1')).toBe(true)
  })

  it('turning it off removes the setting', () => {
    setLockEnabled('u1', true)
    setLockEnabled('u1', false)
    expect(isLockEnabled('u1')).toBe(false)
  })

  it('logging out locks again', () => {
    setLockEnabled('u1', true)
    markUnlocked('u1')
    clearUnlocked()
    expect(needsUnlock('u1')).toBe(true)
  })

  it('does not throw when storage is unavailable (treated as lock off)', () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked') } })
    expect(isLockEnabled('u1')).toBe(false)
    expect(() => setLockEnabled('u1', true)).not.toThrow()
    Object.defineProperty(globalThis, 'localStorage', real)
  })
})
