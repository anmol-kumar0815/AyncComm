import { Ban, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { formatClock, isBigEmoji } from '../../lib/format'
import { receiptState } from '../../lib/receipts'
import MessageMedia from './MessageMedia'
import Ticks from './Ticks'

export default function MessageBubble({ message, mine, startsRun, endsRun, onRetry, onDiscard, onOpenImage, onOpenActions }) {
  const deleted = Boolean(message.deleted_at)
  const isText = message.media_type === 'text'
  const big = !deleted && isText && isBigEmoji(message.content)
  const caption = !deleted && !isText && message.content
  const state = receiptState(message)
  // Options (info / edit / delete) only exist for my own, fully sent, not-yet-deleted messages.
  const hasActions = mine && !deleted && state !== 'pending' && state !== 'failed' && Boolean(onOpenActions)

  const time = (
    <span className={cn('flex items-center gap-1 text-[11px] leading-none', deleted ? 'text-gray-400' : mine && !big ? 'text-blue-100' : 'text-gray-400')}>
      {message.edited_at && !deleted && <span>edited</span>}
      {formatClock(message.created_at)}
      {mine && !deleted && <Ticks state={state} tone={big ? 'plain' : 'on-blue'} />}
    </span>
  )

  const bubbleClass = deleted
    ? 'rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-gray-500'
    : big
      ? 'px-1'
      : cn(
          'rounded-2xl px-3 py-2 shadow-sm',
          mine ? 'bg-blue-600 text-white' : 'bg-white text-gray-900',
          endsRun && (mine ? 'rounded-br-md' : 'rounded-bl-md'), // a small "tail" on the last bubble of a run
          message.failed && 'opacity-70',
          !isText && 'p-1.5',
        )

  return (
    <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start', startsRun ? 'mt-3 first:mt-0' : 'mt-0.5')}>
      <div className={cn('group flex max-w-[88%] items-center gap-1 md:max-w-[70%]', mine && 'flex-row-reverse')}>
        <div className={cn('min-w-0', bubbleClass)}>
          {deleted ? (
            <p className="flex items-center gap-1.5 text-[15px] italic">
              <Ban className="h-4 w-4 shrink-0" aria-hidden="true" /> This message was deleted
            </p>
          ) : isText ? (
            <p className={cn('whitespace-pre-wrap [overflow-wrap:anywhere]', big ? 'text-5xl leading-tight' : 'text-[15px] leading-snug')}>
              {message.content}
            </p>
          ) : (
            <MessageMedia message={message} mine={mine} onOpenImage={onOpenImage} />
          )}
          {caption && <p className="mt-1.5 whitespace-pre-wrap px-1.5 text-[15px] leading-snug [overflow-wrap:anywhere]">{message.content}</p>}
          <div className={cn('mt-1 flex justify-end', !isText && !deleted && 'px-1.5 pb-0.5')}>{time}</div>
        </div>

        {hasActions && (
          <button
            type="button"
            onClick={() => onOpenActions(message.id)}
            aria-label="Message options"
            // hover-only on desktop (less clutter); always faintly visible on touch screens where there is no hover
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-500 opacity-0 transition-opacity hover:bg-gray-200/70 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 group-hover:opacity-100 [@media(hover:none)]:opacity-60"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      </div>

      {message.failed && (
        <p role="alert" className="mt-1 flex items-center gap-2 text-xs text-red-600">
          Not sent.
          <button type="button" onClick={() => onRetry(message.id)} className="font-semibold underline">Retry</button>
          <button type="button" onClick={() => onDiscard(message.id)} className="text-gray-500 underline">Delete</button>
        </p>
      )}
    </div>
  )
}
