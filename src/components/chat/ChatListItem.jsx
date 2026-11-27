import { NavLink } from 'react-router-dom'
import { Avatar } from '../ui/avatar'
import { useChats } from '../../hooks/chatsContext'
import { cn } from '../../lib/utils'
import { formatListTime, messagePreview } from '../../lib/format'

export default function ChatListItem({ chat, meId }) {
  const { last, unread } = chat
  const { onlineIds } = useChats()
  const preview = last ? `${last.senderId === meId ? 'You: ' : ''}${messagePreview(last)}` : 'Say hi 👋'
  return (
    <NavLink
      to={`/chat/${chat.friendId}`}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
          isActive ? 'bg-blue-50' : 'hover:bg-gray-50 active:bg-gray-100',
        )
      }
    >
      <Avatar name={chat.name} seed={chat.email} size="lg" online={onlineIds.has(chat.friendId)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn('truncate text-[16px] text-gray-900', unread ? 'font-semibold' : 'font-medium')}>{chat.name}</span>
          {last && (
            <time dateTime={last.at} className={cn('shrink-0 text-xs', unread ? 'font-medium text-blue-600' : 'text-gray-400')}>
              {formatListTime(last.at)}
            </time>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={cn('truncate text-sm', unread ? 'font-medium text-gray-800' : 'text-gray-500')}>{preview}</span>
          {unread > 0 && (
            <span
              aria-label={`${unread} unread`}
              className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </NavLink>
  )
}
