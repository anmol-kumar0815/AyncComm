import { ImageOff, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useMediaUrl } from '../../hooks/useMediaUrl'
import { displaySize } from '../../lib/media'
import { cn } from '../../lib/utils'
import AudioPlayer from './AudioPlayer'

/** Image or voice-note content of a message bubble. */
export default function MessageMedia({ message, mine, onOpenImage }) {
  if (message.media_type === 'image') return <ImageContent message={message} onOpenImage={onOpenImage} />
  return <AudioPlayer message={message} mine={mine} />
}

function ImageContent({ message, onOpenImage }) {
  const { url, failed } = useMediaUrl(message)
  const [loaded, setLoaded] = useState(false)
  const { width, height } = displaySize(message.media_width, message.media_height)
  const alt = message.content || 'Photo'

  return (
    // The box has its final size before the picture arrives, so nothing shifts.
    <button
      type="button"
      disabled={!url}
      onClick={() => onOpenImage({ url, alt })}
      aria-label={`Open photo${message.content ? `: ${message.content}` : ''}`}
      className="relative block max-w-full cursor-zoom-in overflow-hidden rounded-xl bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-default"
      style={{ width, aspectRatio: `${width} / ${height}` }}
    >
      {url && !failed && (
        <img
          src={url}
          alt={alt}
          width={width}
          height={height}
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(false)}
          className={cn('h-full w-full object-cover transition-opacity', loaded ? 'opacity-100' : 'opacity-0')}
        />
      )}
      {failed && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-gray-500">
          <ImageOff className="h-6 w-6" /> Couldn't load photo
        </span>
      )}
      {(message.pending || (!url && !failed)) && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/10">
          <Loader2 className="h-6 w-6 animate-spin text-white drop-shadow" aria-label="Uploading" />
        </span>
      )}
    </button>
  )
}
