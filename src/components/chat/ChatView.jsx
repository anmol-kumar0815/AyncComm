import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Avatar } from '../ui/avatar'
import { Button } from '../ui/button'
import { Spinner } from '../ui/spinner'
import ChatThread from './ChatThread'
import { useChats } from '../../hooks/chatsContext'
import { getOrCreateConversation } from '../../lib/api/chats'

/** Route element for /chat/:friendId: header + (once we know the conversation id) the thread. */
export default function ChatView({ meId }) {
  const { friendId } = useParams()
  const { chats, status, setConversationId } = useChats()
  const friend = chats.find((c) => c.friendId === friendId)
  const known = friend?.conversationId ?? null
  const hasFriend = Boolean(friend)

  // A friend you've never messaged has no conversation yet: create it on first open.
  const [created, setCreated] = useState({ friendId: null, id: null, error: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!hasFriend || known) return
    let alive = true
    getOrCreateConversation(friendId)
      .then((id) => { if (alive) { setCreated({ friendId, id, error: null }); setConversationId(friendId, id) } })
      .catch((e) => { if (alive) setCreated({ friendId, id: null, error: e.message }) })
    return () => { alive = false }
  }, [friendId, hasFriend, known, attempt, setConversationId])

  const conversationId = known ?? (created.friendId === friendId ? created.id : null)
  const createError = created.friendId === friendId ? created.error : null

  const back = (
    <Link to="/" aria-label="Back to chats" className="-ml-2 rounded-full p-2 text-gray-600 hover:bg-gray-100 md:hidden">
      <ArrowLeft className="h-6 w-6" />
    </Link>
  )

  if (!friend) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center border-b px-3 pt-safe">{back}</div>
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          {status === 'loading' ? <Spinner className="h-6 w-6" /> : (
            <div>
              <p className="font-medium text-gray-800">This conversation isn't available.</p>
              <p className="mt-1 text-sm text-gray-500">They may not be in your friends list.</p>
              <Link to="/" className="mt-4 inline-flex h-11 items-center rounded-lg border border-gray-300 px-4 text-[15px] font-medium hover:bg-gray-50">Back to chats</Link>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[#eaeef3]">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3 pt-safe md:px-5">
        {back}
        <Avatar name={friend.name} seed={friend.email} />
        <div className="min-w-0">
          <h1 className="truncate text-[16px] font-semibold leading-tight">{friend.name}</h1>
          <p className="truncate text-xs text-gray-500">{friend.email}</p>
        </div>
      </header>

      {conversationId ? (
        <ChatThread key={conversationId} conversationId={conversationId} meId={meId} friend={friend} />
      ) : createError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-gray-600">{createError}</p>
          <Button variant="outline" onClick={() => { setCreated({ friendId: null, id: null, error: null }); setAttempt((n) => n + 1) }}>Try again</Button>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center"><Spinner className="h-6 w-6" /></div>
      )}
    </div>
  )
}
