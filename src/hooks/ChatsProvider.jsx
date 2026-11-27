import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchChatList } from '../lib/api/chats'
import { ChatsContext } from './chatsContext'
import { applyIncomingMessage, sortChats } from '../lib/chatList'
import { acceptFriendRequest, declineFriendRequest, fetchPendingRequests } from '../lib/api/friends'

export function ChatsProvider({ userId, children }) {
  const [chats, setChats] = useState([])
  const [requests, setRequests] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)
  const activeConversation = useRef(null)
  const refreshTimer = useRef(null)

  const refresh = useCallback(async () => {
    try {
      const [list, reqs] = await Promise.all([fetchChatList(), fetchPendingRequests()])
      setChats(sortChats(list))
      setRequests(reqs)
      setStatus('ready')
      setError(null)
    } catch (e) {
      console.error(e)
      // Keep showing what we have if a background refresh fails.
      setStatus((s) => (s === 'ready' ? s : 'error'))
      setError(e.message)
    }
  }, [])

  const refreshSoon = useCallback(() => {
    clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(refresh, 250)
  }, [refresh])

  useEffect(() => {
    refresh() // eslint-disable-line react-hooks/set-state-in-effect -- initial fetch of external data
    let firstSubscribe = true
    const channel = supabase
      .channel(`inbox:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, ({ new: m }) => {
        const visible = document.visibilityState === 'visible'
        let unknown = false
        setChats((prev) => {
          const next = applyIncomingMessage(prev, m, {
            userId,
            isActiveAndVisible: visible && activeConversation.current === m.conversation_id,
          })
          unknown = next === null
          return next ?? prev
        })
        if (unknown) refreshSoon() // first message in a brand-new conversation
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, refreshSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friends' }, refreshSoon)
      .subscribe((s) => {
        if (s !== 'SUBSCRIBED') return
        if (firstSubscribe) firstSubscribe = false
        else refresh() // reconnected: catch up on whatever we missed
      })

    const onVisible = () => document.visibilityState === 'visible' && refreshSoon()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', refreshSoon)
    return () => {
      clearTimeout(refreshTimer.current)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', refreshSoon)
      supabase.removeChannel(channel)
    }
  }, [userId, refresh, refreshSoon])

  const totalUnread = useMemo(() => chats.reduce((n, c) => n + c.unread, 0), [chats])
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) AsyncComm` : 'AsyncComm'
  }, [totalUnread])

  const value = useMemo(
    () => ({
      chats, requests, status, error, totalUnread, refresh,
      setActiveConversation: (id) => { activeConversation.current = id },
      markReadLocal: (conversationId) =>
        setChats((prev) => prev.map((c) => (c.conversationId === conversationId && c.unread ? { ...c, unread: 0 } : c))),
      setConversationId: (friendId, conversationId) =>
        setChats((prev) => prev.map((c) => (c.friendId === friendId && !c.conversationId ? { ...c, conversationId } : c))),
      async acceptRequest(req) {
        setRequests((r) => r.filter((x) => x.id !== req.id)) // optimistic
        try { await acceptFriendRequest(req.id) } finally { refresh() }
      },
      async declineRequest(req) {
        setRequests((r) => r.filter((x) => x.id !== req.id))
        try { await declineFriendRequest(req.id) } finally { refresh() }
      },
    }),
    [chats, requests, status, error, totalUnread, refresh],
  )

  return <ChatsContext.Provider value={value}>{children}</ChatsContext.Provider>
}
