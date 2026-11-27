// Media helpers. The pure parts are unit-tested; the canvas part needs a browser.

export const MAX_IMAGE_SOURCE_BYTES = 25 * 1024 * 1024 // what we accept before compressing
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // bucket limit (see migration 003)
export const MAX_IMAGE_SIDE = 1600
export const MAX_VOICE_MS = 5 * 60 * 1000
export const MIN_VOICE_MS = 1000
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

/** 'audio/webm;codecs=opus' -> 'audio/webm' (storage validates the bare type). */
export const baseMime = (type) => String(type || '').split(';')[0].trim().toLowerCase()

const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/aac': 'aac',
}
export const extFromMime = (type) => EXT[baseMime(type)] || 'bin'

// Chrome/Firefox/Edge record webm/ogg opus; Safari only records mp4/aac.
const RECORDER_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

/** First recorder mime the browser supports, or undefined (let the browser choose). */
export function pickRecorderMime(isTypeSupported) {
  return RECORDER_CANDIDATES.find((t) => {
    try { return isTypeSupported(t) } catch { return false }
  })
}

/** Scale (w,h) down so the longest side is at most `max`; never scales up. */
export function fitWithin(w, h, max = MAX_IMAGE_SIDE) {
  const longest = Math.max(w, h)
  if (longest <= max) return { width: w, height: h }
  const k = max / longest
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) }
}

/**
 * On-screen size for an image bubble: fits within maxW x maxH, keeps aspect
 * ratio, never upscales. Reserving this box before the image loads is what
 * stops the conversation from jumping as photos arrive.
 */
export function displaySize(w, h, maxW = 320, maxH = 420) {
  if (!w || !h) return { width: maxW, height: Math.round(maxW * 0.75) }
  const k = Math.min(maxW / w, maxH / h, 1)
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) }
}

/** Returns an error message, or null if the file is acceptable. */
export function validateImageFile(file) {
  if (!file) return 'No file selected.'
  if (!ALLOWED_IMAGE_TYPES.includes(baseMime(file.type))) return 'Only JPEG, PNG, WebP or GIF images can be sent.'
  if (file.size > MAX_IMAGE_SOURCE_BYTES) return 'That image is too large (max 25 MB).'
  return null
}

/**
 * Downscale + re-encode a photo before upload. Phone photos are 3-8 MB; at
 * 1600px/JPEG-82 they're ~200-400 KB, which keeps chat fast and storage cheap.
 * GIFs are sent untouched (re-encoding would drop the animation).
 * @returns {Promise<{blob: Blob, width: number, height: number, mime: string}>}
 */
export async function prepareImage(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null)
  if (!bitmap) throw new Error("This image couldn't be read. Try a JPEG or PNG.")
  try {
    if (baseMime(file.type) === 'gif') {
      if (file.size > MAX_UPLOAD_BYTES) throw new Error('That GIF is too large (max 10 MB).')
      return { blob: file, width: bitmap.width, height: bitmap.height, mime: 'image/gif' }
    }
    const { width, height } = fitWithin(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff' // JPEG has no alpha: flatten transparent PNGs onto white, not black
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (!blob) throw new Error("This image couldn't be processed.")
    if (blob.size > MAX_UPLOAD_BYTES) throw new Error('That image is too large even after compression.')
    return { blob, width, height, mime: 'image/jpeg' }
  } finally {
    bitmap.close?.()
  }
}

/**
 * Signed-URL cache. Chat media is private, so every image/voice note needs a
 * short-lived signed URL; this avoids re-signing on every render and dedupes
 * concurrent requests. `sign(path) -> Promise<url>` is injected for testing.
 */
export function createUrlCache({ sign, ttlMs = 50 * 60 * 1000, now = () => Date.now() }) {
  const entries = new Map() // path -> { url, expires } | { promise }
  return {
    get(path) {
      const e = entries.get(path)
      if (e?.promise) return e.promise
      if (e && e.expires > now()) return Promise.resolve(e.url)
      const promise = sign(path).then(
        (url) => { entries.set(path, { url, expires: now() + ttlMs }); return url },
        (err) => { entries.delete(path); throw err },
      )
      entries.set(path, { promise })
      return promise
    },
    peek(path) {
      const e = entries.get(path)
      return e && !e.promise && e.expires > now() ? e.url : null
    },
    clear: () => entries.clear(),
  }
}
