import { useEffect, useState } from 'react'
import { getMediaUrl, peekMediaUrl } from '../lib/api/messages'

/**
 * URL to show for a message's media. Our own just-sent media uses the local
 * blob (instant, no round trip); everything else gets a signed URL for the
 * private bucket, cached across renders.
 */
export function useMediaUrl(message) {
  const path = message.media_path
  const [loaded, setLoaded] = useState({ path: null, url: null, failed: false })

  useEffect(() => {
    if (!path) return
    let alive = true
    getMediaUrl(path)
      .then((url) => alive && setLoaded({ path, url, failed: false }))
      .catch(() => alive && setLoaded({ path, url: null, failed: true }))
    return () => { alive = false }
  }, [path])

  if (message.localUrl) return { url: message.localUrl, failed: false }
  if (!path) return { url: null, failed: false }
  if (loaded.path === path) return { url: loaded.url, failed: loaded.failed }
  return { url: peekMediaUrl(path), failed: false } // already signed earlier: no flash
}
