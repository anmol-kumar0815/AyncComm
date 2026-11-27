import { describe, it, expect, vi } from 'vitest'
import { baseMime, extFromMime, pickRecorderMime, fitWithin, displaySize, validateImageFile, createUrlCache } from '../src/lib/media.js'

describe('mime helpers', () => {
  it('strips codec parameters', () => {
    expect(baseMime('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(baseMime('Audio/MP4 ; codecs=mp4a.40.2')).toBe('audio/mp4')
    expect(baseMime(undefined)).toBe('')
  })
  it('maps mime to file extension', () => {
    expect(extFromMime('audio/webm;codecs=opus')).toBe('webm')
    expect(extFromMime('audio/mp4')).toBe('m4a')
    expect(extFromMime('image/jpeg')).toBe('jpg')
    expect(extFromMime('application/x-weird')).toBe('bin')
  })
})

describe('pickRecorderMime', () => {
  it('prefers webm/opus (Chrome, Firefox, Edge)', () => {
    expect(pickRecorderMime(() => true)).toBe('audio/webm;codecs=opus')
  })
  it('falls back to mp4 on Safari, which has no webm recording', () => {
    expect(pickRecorderMime((t) => t === 'audio/mp4')).toBe('audio/mp4')
  })
  it('returns undefined when nothing is supported, or the probe throws', () => {
    expect(pickRecorderMime(() => false)).toBeUndefined()
    expect(pickRecorderMime(() => { throw new Error('nope') })).toBeUndefined()
  })
})

describe('fitWithin', () => {
  it('scales the longest side down, keeping aspect ratio', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
  })
  it('never scales up', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })
  it('never produces a zero dimension for extreme panoramas', () => {
    expect(fitWithin(100000, 10, 1600).height).toBeGreaterThanOrEqual(1)
  })
})

describe('displaySize', () => {
  it('fits landscape, portrait and square images in the bubble box', () => {
    expect(displaySize(1600, 1200)).toEqual({ width: 320, height: 240 })
    expect(displaySize(1200, 1600)).toEqual({ width: 315, height: 420 })
    expect(displaySize(1000, 1000)).toEqual({ width: 320, height: 320 })
  })
  it('does not upscale small images', () => {
    expect(displaySize(100, 50)).toEqual({ width: 100, height: 50 })
  })
  it('falls back to a sensible box when the size is unknown', () => {
    expect(displaySize(null, null)).toEqual({ width: 320, height: 240 })
  })
})

describe('validateImageFile', () => {
  it('accepts normal images', () => {
    expect(validateImageFile({ type: 'image/png', size: 1000 })).toBeNull()
  })
  it('rejects non-images, svg (script risk), missing and oversize files', () => {
    expect(validateImageFile({ type: 'application/pdf', size: 1 })).toMatch(/Only/)
    expect(validateImageFile({ type: 'image/svg+xml', size: 1 })).toMatch(/Only/)
    expect(validateImageFile(null)).toMatch(/No file/)
    expect(validateImageFile({ type: 'image/jpeg', size: 26 * 1024 * 1024 })).toMatch(/too large/)
  })
})

describe('createUrlCache', () => {
  it('signs once for concurrent requests and reuses the result', async () => {
    const sign = vi.fn(async (p) => `url:${p}`)
    const cache = createUrlCache({ sign })
    const [a, b] = await Promise.all([cache.get('x'), cache.get('x')])
    expect(a).toBe('url:x'); expect(b).toBe('url:x')
    await cache.get('x')
    expect(sign).toHaveBeenCalledTimes(1)
    expect(cache.peek('x')).toBe('url:x')
  })
  it('re-signs after the TTL so links never go stale on screen', async () => {
    let n = 0
    let clock = 0
    const sign = vi.fn(async () => `u${++n}`)
    const cache = createUrlCache({ sign, ttlMs: 1000, now: () => clock })
    expect(await cache.get('x')).toBe('u1')
    clock = 999
    expect(await cache.get('x')).toBe('u1')
    clock = 1001
    expect(cache.peek('x')).toBeNull()
    expect(await cache.get('x')).toBe('u2')
  })
  it('does not cache failures', async () => {
    const sign = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok')
    const cache = createUrlCache({ sign })
    await expect(cache.get('x')).rejects.toThrow('boom')
    expect(await cache.get('x')).toBe('ok')
  })
})
