import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, Pause, Play } from 'lucide-react'
import { useMediaUrl } from '../../hooks/useMediaUrl'
import { formatDuration } from '../../lib/format'
import { nextSpeed } from '../../lib/audio'
import { cn } from '../../lib/utils'

let playing = null // only one voice note plays at a time

/**
 * Voice-note player. Uses the duration stored with the message, not the file's:
 * browser-recorded webm has no duration header, so <audio>.duration is Infinity.
 */
export default function AudioPlayer({ message, mine }) {
  const { url, failed } = useMediaUrl(message)
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [position, setPosition] = useState(0) // seconds
  const [speed, setSpeed] = useState(1)
  const [broken, setBroken] = useState(false)
  const total = (message.media_duration_ms || 0) / 1000
  const uploading = Boolean(message.pending)

  useEffect(() => {
    const el = audioRef.current
    return () => { if (playing === el) playing = null }
  }, [])

  const toggle = async () => {
    const el = audioRef.current
    if (!el) return
    if (!el.paused) { el.pause(); return }
    if (playing && playing !== el) playing.pause()
    playing = el
    el.playbackRate = speed
    try { await el.play() } catch { setBroken(true) }
  }

  const seek = (e) => {
    const t = Number(e.target.value)
    setPosition(t)
    if (audioRef.current) audioRef.current.currentTime = t
  }

  const cycleSpeed = () => {
    const s = nextSpeed(speed)
    setSpeed(s)
    if (audioRef.current) audioRef.current.playbackRate = s
  }

  const ready = Boolean(url) && !uploading && !failed
  const shown = isPlaying || position > 0 ? position : total
  const fg = mine ? 'text-white' : 'text-gray-800'

  return (
    <div className={cn('flex w-[240px] max-w-full items-center gap-2 px-1.5 py-0.5', fg)}>
      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => { setIsPlaying(false); setPosition(0) }}
          onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
          onError={() => setBroken(true)}
        />
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={!ready || broken}
        aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2',
          mine ? 'bg-white/20 hover:bg-white/30 focus-visible:ring-white' : 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500',
          'disabled:opacity-60',
        )}
      >
        {uploading || (!url && !failed) ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Uploading" />
          : failed || broken ? <AlertCircle className="h-5 w-5" />
          : isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-px" />}
      </button>

      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={total || 1}
          step={0.1}
          value={Math.min(position, total || 1)}
          onChange={seek}
          disabled={!ready || broken}
          aria-label="Seek voice note"
          className={cn('block h-1.5 w-full cursor-pointer', mine ? 'accent-white' : 'accent-blue-600')}
        />
        <div className={cn('mt-1 flex items-center justify-between text-[11px] leading-none tabular-nums', mine ? 'text-blue-100' : 'text-gray-500')}>
          <span>{broken || failed ? "Can't play" : formatDuration(shown * 1000)}</span>
          {(isPlaying || position > 0) && (
            <button type="button" onClick={cycleSpeed} aria-label={`Playback speed ${speed}x`} className="rounded-full px-1.5 py-0.5 font-semibold hover:bg-black/10">
              {speed}×
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
