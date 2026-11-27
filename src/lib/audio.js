// Pure helpers for voice notes.

/** Human-friendly message for a getUserMedia / MediaRecorder failure. */
export function micErrorMessage(err) {
  const name = err?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access is blocked. Allow it in your browser’s site settings to send voice notes.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found on this device.'
  if (name === 'NotReadableError' || name === 'AbortError') return 'Your microphone is being used by another app.'
  return "Couldn't start recording. Please try again."
}

/** Why voice notes can't work here at all (undefined = they can). */
export function voiceUnsupportedReason(env = globalThis) {
  if (!env.isSecureContext) return 'Voice notes need a secure (https) connection.'
  if (!env.navigator?.mediaDevices?.getUserMedia || typeof env.MediaRecorder === 'undefined') {
    return 'Voice notes aren’t supported in this browser.'
  }
  return undefined
}

/** Root-mean-square loudness of 8-bit time-domain samples, scaled to 0..1 for a level meter. */
export function rmsLevel(samples) {
  if (!samples.length) return 0
  let sum = 0
  for (const v of samples) {
    const x = (v - 128) / 128
    sum += x * x
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 3)
}

export const PLAYBACK_SPEEDS = [1, 1.5, 2]
export const nextSpeed = (s) => PLAYBACK_SPEEDS[(PLAYBACK_SPEEDS.indexOf(s) + 1) % PLAYBACK_SPEEDS.length]
