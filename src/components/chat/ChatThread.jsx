import { useEffect, useMemo } from 'react'
import MessageList from './MessageList'
import Composer from './Composer'
import { useMessages } from '../../hooks/useMessages'
import { useChats } from '../../hooks/chatsContext'
import { useIsVisible } from '../../hooks/useVisibility'
import { markConversationRead } from '../../lib/api/chats'

/** The open conversation. Remounted (via key) per conversation so all state resets cleanly. */
export default function ChatThread({ conversationId, meId, friend }) {
  const { setActiveConversation, markReadLocal } = useChats()
  const visible = useIsVisible()
  const m = useMessages(conversationId, meId)

  useEffect(() => {
    setActiveConversation(conversationId)
    return () => setActiveConversation(null)
  }, [conversationId, setActiveConversation])

  // Mark as read when a message from them is on screen (tab visible), not merely received.
  const lastIncomingId = useMemo(() => m.messages.findLast((x) => x.sender_id !== meId && !x.pending)?.id, [m.messages, meId])
  const needsRead = m.status === 'ready' && visible && (lastIncomingId || friend.unread > 0)
  useEffect(() => {
    if (!needsRead) return
    const t = setTimeout(() => {
      markConversationRead(conversationId)
      markReadLocal(conversationId)
    }, 300)
    return () => clearTimeout(t)
  }, [needsRead, lastIncomingId, conversationId, markReadLocal])

  return (
    <>
      <MessageList
        messages={m.messages}
        meId={meId}
        friendName={friend.name}
        status={m.status}
        error={m.error}
        hasMore={m.hasMore}
        loadingMore={m.loadingMore}
        onLoadEarlier={m.loadEarlier}
        onReload={m.reload}
        onRetry={m.retry}
        onDiscard={m.discard}
        onOpenImage={() => {}}
      />
      <Composer conversationId={conversationId} disabled={m.status !== 'ready'} onSendText={m.sendText} />
    </>
  )
}
