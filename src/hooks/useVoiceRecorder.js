import { useCallback, useEffect, useRef, useState } from 'react'
import { baseMime, MAX_VOICE_MS, MIN_VOICE_MS, pickRecorderMime } from '../lib/media'
import { micErrorMessage, rmsLevel, voiceUnsupportedReason } from '../lib/audio'

/**
 * Tap-to-record voice notes (no need to hold a button down).
 *
 *   const rec = useVoiceRecorder({ onAutoStop })
 *   await rec.start()            -> { ok } | { ok:false, error }
 *   await rec.stop()             -> { blob, mime, durationMs } | { tooShort:true } | null
 *   rec.cancel()                 -> discard, release the mic
 *
 * Duration is measured with a clock, not read from the file: Chrome's webm
 * output has no duration header, so <audio> reports Infinity for it.
 */
export function useVoiceRecorder({ onAutoStop } = {}) {
  const [phase, setPhase] = useState('idle') // idle | starting | recording
  const [elapsedMs, setElapsedMs] = useState(0)
  const [level, setLevel] = useState(0)
  const s = useRef({})
  const autoStopRef = useRef(onAutoStop)
  useEffect(() => { autoStopRef.current = onAutoStop })

  const release = useCallback(() => {
    const x = s.current
    clearInterval(x.timer)
    cancelAnimationFrame(x.raf)
    x.stream?.getTracks().forEach((t) => t.stop()) // turns the browser's "recording" indicator off
    x.ctx?.close().catch(() => {})
    s.current = {}
    setLevel(0)
    setElapsedMs(0)
    setPhase('idle')
  }, [])

  const stop = useCallback(() => new Promise((resolve) => {
    const rec = s.current.recorder
    if (!rec || rec.state === 'inactive') return resolve(null)
    rec.onstop = () => {
      const { chunks, startedAt } = s.current
      const type = rec.mimeType || 'audio/webm'
      const durationMs = Math.round(performance.now() - startedAt)
      release()
      if (durationMs < MIN_VOICE_MS) return resolve({ tooShort: true })
      resolve({ blob: new Blob(chunks, { type }), mime: baseMime(type), durationMs: Math.min(durationMs, MAX_VOICE_MS) })
    }
    rec.stop()
  }), [release])

  const cancel = useCallback(() => {
    const rec = s.current.recorder
    if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop() }
    release()
  }, [release])

  const start = useCallback(async () => {
    if (s.current.busy) return { ok: false }
    const unsupported = voiceUnsupportedReason()
    if (unsupported) return { ok: false, error: unsupported }
    s.current.busy = true
    setPhase('starting')
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch (e) {
      s.current = {}
      setPhase('idle')
      return { ok: false, error: micErrorMessage(e) }
    }

    try {
      const mimeType = pickRecorderMime((t) => MediaRecorder.isTypeSupported(t))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined)
      const chunks = []
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
      const startedAt = performance.now()
      s.current = { stream, recorder, chunks, startedAt, busy: true }

      // Optional live level meter; recording works fine without it.
      try {
        const AC = window.AudioContext || window.webkitAudioContext
        if (AC) {
          const ctx = new AC()
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 256
          ctx.createMediaStreamSource(stream).connect(analyser)
          const data = new Uint8Array(analyser.fftSize)
          let last = 0
          const tick = (now) => {
            if (now - last > 70) { analyser.getByteTimeDomainData(data); setLevel(rmsLevel(data)); last = now }
            s.current.raf = requestAnimationFrame(tick)
          }
          s.current.ctx = ctx
          s.current.raf = requestAnimationFrame(tick)
        }
      } catch { /* meter is cosmetic */ }

      s.current.timer = setInterval(() => {
        const ms = performance.now() - startedAt
        setElapsedMs(ms)
        if (ms >= MAX_VOICE_MS) stop().then((r) => autoStopRef.current?.(r))
      }, 100)
      recorder.start()
      setPhase('recording')
      return { ok: true }
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop())
      s.current = {}
      setPhase('idle')
      return { ok: false, error: micErrorMessage(e) }
    }
  }, [stop])

  // Never leave the microphone on if the chat closes mid-recording.
  useEffect(() => cancel, [cancel])

  return { phase, elapsedMs, level, start, stop, cancel }
}
