import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import MessageBubble from './MessageBubble'
import { Button } from '../ui/button'
import { Spinner } from '../ui/spinner'
import { buildTimeline } from '../../lib/messages'
import { formatDayLabel } from '../../lib/format'

const NEAR_BOTTOM_PX = 160

export default function MessageList({ messages, meId, friendName, status, error, hasMore, loadingMore, onLoadEarlier, onReload, onRetry, onDiscard, onOpenImage, onOpenActions }) {
  const listRef = useRef(null)
  const snapshot = useRef({ firstId: null, lastId: null, scrollHeight: 0 })
  const [unseen, setUnseen] = useState(0)
  const stickToBottom = useRef(true) // was the reader at the bottom before the last resize/scroll?
  const timeline = useMemo(() => buildTimeline(messages), [messages])

  // Scroll management: stick to the bottom for new messages (unless the reader
  // scrolled up), and keep the viewport still when older messages are prepended.
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const prev = snapshot.current
    const first = messages[0]?.id ?? null
    const last = messages.at(-1)?.id ?? null

    if (prev.lastId === null && last) {
      el.scrollTop = el.scrollHeight // first paint of a conversation: jump to the latest
    } else if (first !== prev.firstId && last === prev.lastId) {
      el.scrollTop += el.scrollHeight - prev.scrollHeight // older page prepended
    } else if (last !== prev.lastId) {
      const mine = messages.at(-1).sender_id === meId
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
      if (mine || nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      else setUnseen((n) => n + 1)
    }
    snapshot.current = { firstId: first, lastId: last, scrollHeight: el.scrollHeight }
  }, [messages, meId])

  // When the list gets shorter (emoji panel opens, phone keyboard appears) keep the latest
  // messages visible instead of leaving them hidden below the fold.
  useEffect(() => {
    const el = listRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { if (stickToBottom.current) el.scrollTop = el.scrollHeight })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const onScroll = () => {
    const el = listRef.current
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    if (unseen && el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX) setUnseen(0)
  }
  const jumpToLatest = () => {
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    setUnseen(0)
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={listRef} onScroll={onScroll} className="h-full overflow-y-auto scrollbar-thin px-3 py-4 md:px-6" role="log" aria-live="polite" aria-label={`Conversation with ${friendName}`}>
        {status === 'loading' && <div className="flex justify-center py-10"><Spinner className="h-6 w-6" label="Loading messages" /></div>}

        {status === 'error' && (
          <div className="py-10 text-center">
            <p className="text-gray-600">{error || "Couldn't load messages."}</p>
            <Button variant="outline" className="mt-3" onClick={onReload}>Try again</Button>
          </div>
        )}

        {status === 'ready' && hasMore && (
          <div className="mb-3 flex justify-center">
            <Button variant="secondary" size="sm" onClick={onLoadEarlier} disabled={loadingMore}>
              {loadingMore ? <Spinner className="h-4 w-4" /> : 'Load earlier messages'}
            </Button>
          </div>
        )}

        {status === 'ready' && messages.length === 0 && (
          <div className="mx-auto mt-16 max-w-xs rounded-2xl bg-white/80 px-5 py-6 text-center shadow-sm">
            <p className="text-3xl">👋</p>
            <p className="mt-2 font-medium text-gray-800">No messages yet</p>
            <p className="mt-1 text-sm text-gray-500">Say hi to {friendName}.</p>
          </div>
        )}

        {timeline.map((item) =>
          item.kind === 'day' ? (
            <div key={item.key} className="my-4 flex justify-center first:mt-0">
              <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-gray-500 shadow-sm">{formatDayLabel(item.date)}</span>
            </div>
          ) : (
            <MessageBubble
              key={item.key}
              message={item.message}
              mine={item.message.sender_id === meId}
              startsRun={item.startsRun}
              endsRun={item.endsRun}
              onRetry={onRetry}
              onDiscard={onDiscard}
              onOpenImage={onOpenImage}
              onOpenActions={onOpenActions}
            />
          ),
        )}
      </div>

      {unseen > 0 && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="animate-pop-in absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-blue-700"
        >
          <ArrowDown className="h-4 w-4" /> {unseen} new message{unseen > 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}
