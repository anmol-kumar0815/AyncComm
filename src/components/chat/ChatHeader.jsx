import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Avatar } from '../ui/avatar'
import { cn } from '../../lib/utils'
import { presenceLabel } from '../../lib/format'
import { usePresence } from '../../hooks/chatsContext'

const TONE = { typing: 'text-emerald-600 font-medium', online: 'text-emerald-600', muted: 'text-gray-500' }

/** Name plus one status line: typing… > online > last seen ... */
export default function ChatHeader({ friend, typing = false }) {
  const { online, lastSeenAt } = usePresence(friend)
  const { text, tone } = presenceLabel({ typing, online, lastSeenAt })
  return (
    <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3 pt-safe md:px-5">
      <Link to="/" aria-label="Back to chats" className="-ml-2 rounded-full p-2 text-gray-600 hover:bg-gray-100 md:hidden">
        <ArrowLeft className="h-6 w-6" />
      </Link>
      <Avatar name={friend.name} seed={friend.email} online={online} />
      <div className="min-w-0">
        <h1 className="truncate text-[16px] font-semibold leading-tight">{friend.name}</h1>
        {/* aria-live so assistive tech hears "typing…" appear without moving focus */}
        <p aria-live="polite" className={cn('h-4 truncate text-xs leading-4', TONE[tone])}>{text}</p>
      </div>
    </header>
  )
}
