import { AlertCircle, Check, Clock } from 'lucide-react'
import { cn } from '../../lib/utils'
import { formatClock, isBigEmoji } from '../../lib/format'
import MessageMedia from './MessageMedia'

function Status({ message, mine }) {
  if (!mine) return null
  if (message.failed) return <AlertCircle className="h-3.5 w-3.5 text-red-300" aria-label="Not sent" />
  if (message.pending) return <Clock className="h-3.5 w-3.5 opacity-70" aria-label="Sending" />
  return <Check className="h-3.5 w-3.5 opacity-80" aria-label="Sent" />
}

export default function MessageBubble({ message, mine, startsRun, endsRun, onRetry, onDiscard, onOpenImage }) {
  const isText = message.media_type === 'text'
  const big = isText && isBigEmoji(message.content)
  const caption = !isText && message.content

  const time = (
    <span className={cn('flex items-center gap-1 text-[11px] leading-none', mine && !big ? 'text-blue-100' : 'text-gray-400')}>
      {formatClock(message.created_at)}
      <Status message={message} mine={mine} />
    </span>
  )

  return (
    <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start', startsRun ? 'mt-3 first:mt-0' : 'mt-0.5')}>
      <div
        className={cn(
          'max-w-[82%] md:max-w-[65%]',
          big
            ? 'px-1'
            : cn(
                'rounded-2xl px-3 py-2 shadow-sm',
                mine ? 'bg-blue-600 text-white' : 'bg-white text-gray-900',
                // a small "tail" corner on the last bubble of a run
                endsRun && (mine ? 'rounded-br-md' : 'rounded-bl-md'),
                message.failed && 'opacity-70',
                !isText && 'p-1.5',
              ),
        )}
      >
        {isText ? (
          <p className={cn('whitespace-pre-wrap [overflow-wrap:anywhere]', big ? 'text-5xl leading-tight' : 'text-[15px] leading-snug')}>
            {message.content}
          </p>
        ) : (
          <MessageMedia message={message} mine={mine} onOpenImage={onOpenImage} />
        )}
        {caption && <p className="mt-1.5 whitespace-pre-wrap px-1.5 text-[15px] leading-snug [overflow-wrap:anywhere]">{message.content}</p>}
        <div className={cn('mt-1 flex justify-end', !isText && 'px-1.5 pb-0.5')}>{time}</div>
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
