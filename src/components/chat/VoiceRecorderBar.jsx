import { useEffect } from 'react'
import { Send, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { formatDuration } from '../../lib/format'
import { MAX_VOICE_MS } from '../../lib/media'

const BARS = 28

/** Replaces the text box while recording: cancel, live timer + level, send. Esc cancels, Enter sends. */
export default function VoiceRecorderBar({ elapsedMs, level, onCancel, onSend }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel()
      // Enter on a focused button already activates that button; don't also send.
      else if (e.key === 'Enter' && !e.target.closest?.('button')) { e.preventDefault(); onSend() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, onSend])

  const remaining = MAX_VOICE_MS - elapsedMs
  const nearLimit = remaining < 15_000

  return (
    <div className="flex items-center gap-2 border-t border-gray-200 bg-white px-2 pt-2 [--pad-b:0.5rem] pb-safe md:px-4" role="group" aria-label="Recording voice note">
      <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Cancel recording" className="text-red-600 hover:bg-red-50">
        <Trash2 className="h-6 w-6" />
      </Button>

      <div className="flex min-h-11 flex-1 items-center gap-3 rounded-3xl bg-red-50 px-4">
        <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-600" aria-hidden="true" />
        <span className="w-11 shrink-0 font-mono text-sm tabular-nums text-gray-800" role="timer" aria-label="Recording time">
          {formatDuration(elapsedMs)}
        </span>
        {/* Bars light up with microphone loudness so you can see it's actually hearing you. */}
        <div className="flex h-6 flex-1 items-center gap-[3px]" aria-hidden="true">
          {Array.from({ length: BARS }, (_, i) => {
            const wave = 0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + elapsedMs / 180))
            const h = Math.max(12, Math.round(100 * Math.min(1, level * wave * 1.4 + 0.08)))
            return <span key={i} className="w-[3px] rounded-full bg-red-400 transition-[height] duration-100" style={{ height: `${h}%` }} />
          })}
        </div>
        {nearLimit && <span className="shrink-0 text-xs font-medium text-red-700">{Math.max(0, Math.ceil(remaining / 1000))}s left</span>}
      </div>

      <Button size="icon" onClick={onSend} aria-label="Send voice note" className="rounded-full">
        <Send className="h-5 w-5" />
      </Button>
    </div>
  )
}
