import { supabase } from '../supabase'
import { friendlyError } from './errors'

/**
 * One entry per friend: { friendId, email, name, conversationId|null,
 * last: { id, type, content, senderId, durationMs, at } | null, unread }
 */
export async function fetchChatList() {
  const { data, error } = await supabase.rpc('get_chat_list')
  if (error) throw new Error(friendlyError(error, "Couldn't load your chats."))
  return (data ?? []).map((r) => ({
    friendId: r.friend_id,
    email: r.friend_email,
    name: r.friend_name,
    conversationId: r.conversation_id,
    last: r.last_message_id
      ? {
          id: r.last_message_id,
          type: r.last_message_type,
          content: r.last_message_content,
          senderId: r.last_message_sender_id,
          durationMs: r.last_message_duration_ms,
          at: r.last_message_at,
          deleted: Boolean(r.last_message_deleted),
        }
      : null,
    unread: r.unread_count ?? 0,
    lastSeenAt: r.friend_last_seen_at ?? null,
  }))
}

export async function getOrCreateConversation(friendId) {
  const { data, error } = await supabase.rpc('get_or_create_conversation', { p_friend_id: friendId })
  if (error) throw new Error(friendlyError(error, "Couldn't open this chat."))
  return data
}

export async function markConversationRead(conversationId) {
  const { error } = await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId })
  if (error) console.warn('mark read failed', error)
}

/** "My app is open and has your messages": gives the senders their second tick. */
export async function markMessagesDelivered() {
  const { error } = await supabase.rpc('mark_messages_delivered')
  if (error) console.warn('mark delivered failed', error)
}

/** Heartbeat for "last seen" (the server throttles writes). */
export async function touchLastSeen() {
  const { error } = await supabase.rpc('touch_last_seen')
  if (error) console.warn('last seen failed', error)
}
