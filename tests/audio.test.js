import { describe, it, expect } from 'vitest'
import { micErrorMessage, nextSpeed, rmsLevel, voiceUnsupportedReason } from '../src/lib/audio.js'

describe('micErrorMessage', () => {
  it('explains a denied permission in terms of what to do', () => {
    expect(micErrorMessage({ name: 'NotAllowedError' })).toMatch(/blocked.*site settings/i)
  })
  it('distinguishes no device from a busy device', () => {
    expect(micErrorMessage({ name: 'NotFoundError' })).toMatch(/No microphone/)
    expect(micErrorMessage({ name: 'NotReadableError' })).toMatch(/another app/)
  })
  it('has a generic fallback (including for missing errors)', () => {
    expect(micErrorMessage(new Error('???'))).toMatch(/try again/i)
    expect(micErrorMessage(undefined)).toMatch(/try again/i)
  })
})

describe('voiceUnsupportedReason', () => {
  const ok = { isSecureContext: true, navigator: { mediaDevices: { getUserMedia() {} } }, MediaRecorder: class {} }
  it('is undefined when everything is available', () => {
    expect(voiceUnsupportedReason(ok)).toBeUndefined()
  })
  it('flags plain http (getUserMedia only works on https/localhost)', () => {
    expect(voiceUnsupportedReason({ ...ok, isSecureContext: false })).toMatch(/https/)
  })
  it('flags browsers without MediaRecorder or getUserMedia', () => {
    expect(voiceUnsupportedReason({ ...ok, MediaRecorder: undefined })).toMatch(/aren.t supported/)
    expect(voiceUnsupportedReason({ ...ok, navigator: {} })).toMatch(/aren.t supported/)
  })
})

describe('rmsLevel', () => {
  it('is 0 for silence (128 = zero crossing) and for no samples', () => {
    expect(rmsLevel(new Uint8Array(64).fill(128))).toBe(0)
    expect(rmsLevel(new Uint8Array(0))).toBe(0)
  })
  it('grows with amplitude and is capped at 1', () => {
    const quiet = rmsLevel(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 132 : 124)))
    const loud = rmsLevel(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 255 : 0)))
    expect(quiet).toBeGreaterThan(0)
    expect(loud).toBeGreaterThan(quiet)
    expect(loud).toBe(1)
  })
})

describe('nextSpeed', () => {
  it('cycles 1x -> 1.5x -> 2x -> 1x', () => {
    expect(nextSpeed(1)).toBe(1.5)
    expect(nextSpeed(1.5)).toBe(2)
    expect(nextSpeed(2)).toBe(1)
  })
})
