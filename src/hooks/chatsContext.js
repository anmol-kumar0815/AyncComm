import { createContext, useContext } from 'react'

export const ChatsContext = createContext(null)
export const useChats = () => useContext(ChatsContext)

/** { online, lastSeenAt } for a friend: live presence if we have it, else the stored last seen. */
export function usePresence(friend) {
  const { onlineIds, wentOffline } = useChats()
  if (!friend) return { online: false, lastSeenAt: null }
  const online = onlineIds.has(friend.friendId)
  // If we watched them leave, that moment is fresher than the last-seen stored when the list loaded.
  const lastSeenAt = wentOffline[friend.friendId] ?? friend.lastSeenAt
  return { online, lastSeenAt }
}
