// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useVoiceRecorder } from '../src/hooks/useVoiceRecorder.js'
import { MAX_VOICE_MS } from '../src/lib/media.js'

let now
let tracks
let created // MediaRecorder constructor args
let supported

class FakeMediaRecorder {
  static isTypeSupported = (t) => supported(t)
  constructor(stream, opts) {
    this.stream = stream
    this.mimeType = opts?.mimeType ?? ''
    this.state = 'inactive'
    created.push(opts)
  }
  start() { this.state = 'recording' }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['voice-bytes'], { type: this.mimeType }) })
    queueMicrotask(() => this.onstop?.())
  }
}

beforeEach(() => {
  now = 1000
  created = []
  supported = (t) => t.startsWith('audio/webm')
  tracks = [{ stop: vi.fn() }]
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => tracks })) },
  })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('useVoiceRecorder', () => {
  it('records, returns the blob with a clock-measured duration, and releases the mic', async () => {
    const { result } = renderHook(() => useVoiceRecorder())
    let r
    await act(async () => { r = await result.current.start() })
    expect(r).toEqual({ ok: true })
    expect(result.current.phase).toBe('recording')
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: expect.objectContaining({ echoCancellation: true }) })

    now += 3200
    let out
    await act(async () => { out = await result.current.stop() })
    expect(out.durationMs).toBe(3200)
    expect(out.mime).toBe('audio/webm') // codec parameters stripped for storage
    expect(out.blob).toBeInstanceOf(Blob)
    expect(out.blob.size).toBeGreaterThan(0)
    expect(tracks[0].stop).toHaveBeenCalled() // browser's recording indicator goes off
    expect(result.current.phase).toBe('idle')
  })

  it('treats recordings under the minimum as accidental taps', async () => {
    const { result } = renderHook(() => useVoiceRecorder())
    await act(async () => { await result.current.start() })
    now += 300
    let out
    await act(async () => { out = await result.current.stop() })
    expect(out).toEqual({ tooShort: true })
    expect(tracks[0].stop).toHaveBeenCalled()
  })

  it('cancel discards everything and releases the mic', async () => {
    const { result } = renderHook(() => useVoiceRecorder())
    await act(async () => { await result.current.start() })
    act(() => result.current.cancel())
    expect(result.current.phase).toBe('idle')
    expect(tracks[0].stop).toHaveBeenCalled()
  })

  it('releases the mic if the chat is closed mid-recording', async () => {
    const { result, unmount } = renderHook(() => useVoiceRecorder())
    await act(async () => { await result.current.start() })
    unmount()
    expect(tracks[0].stop).toHaveBeenCalled()
  })

  it('reports a blocked microphone in plain language and stays idle', async () => {
    navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotAllowedError' }))
    const { result } = renderHook(() => useVoiceRecorder())
    let r
    await act(async () => { r = await result.current.start() })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/blocked/i)
    expect(result.current.phase).toBe('idle')
  })

  it('refuses on insecure origins instead of failing obscurely', async () => {
    vi.stubGlobal('isSecureContext', false)
    const { result } = renderHook(() => useVoiceRecorder())
    let r
    await act(async () => { r = await result.current.start() })
    expect(r.error).toMatch(/https/)
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
  })

  it('falls back to mp4 where webm recording is unavailable (Safari)', async () => {
    supported = (t) => t === 'audio/mp4'
    const { result } = renderHook(() => useVoiceRecorder())
    await act(async () => { await result.current.start() })
    expect(created[0].mimeType).toBe('audio/mp4')
    now += 2000
    let out
    await act(async () => { out = await result.current.stop() })
    expect(out.mime).toBe('audio/mp4')
  })

  it('ignores a second start while one is in progress', async () => {
    const { result } = renderHook(() => useVoiceRecorder())
    await act(async () => { await result.current.start() })
    let r
    await act(async () => { r = await result.current.start() })
    expect(r).toEqual({ ok: false })
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('stops by itself at the maximum length and hands the result to onAutoStop', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const onAutoStop = vi.fn()
    const { result } = renderHook(() => useVoiceRecorder({ onAutoStop }))
    await act(async () => { await result.current.start() })
    now += MAX_VOICE_MS + 50
    await act(async () => { vi.advanceTimersByTime(150) })
    await waitFor(() => expect(onAutoStop).toHaveBeenCalled())
    expect(onAutoStop.mock.calls[0][0].durationMs).toBe(MAX_VOICE_MS) // capped
    expect(tracks[0].stop).toHaveBeenCalled()
  })
})
