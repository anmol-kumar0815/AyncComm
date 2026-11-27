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
  const chatsRef = useRef([]) // latest list, for realtime handlers that must not close over stale state
  useEffect(() => { chatsRef.current = chats })
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
        // Decide *outside* the state updater: React runs updaters lazily, so a flag set inside one
        // can't be read right after setChats().
        if (!chatsRef.current.some((c) => c.conversationId === m.conversation_id)) {
          refreshSoon() // first message in a conversation we haven't seen yet
          return
        }
        const visible = document.visibilityState === 'visible'
        setChats((prev) =>
          applyIncomingMessage(prev, m, { userId, isActiveAndVisible: visible && activeConversation.current === m.conversation_id }) ?? prev,
        )
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

  // Stable identities: components list these in effect dependencies, and a new function
  // on every chat update would make those effects re-run (and e.g. re-open a conversation).
  const setActiveConversation = useCallback((id) => { activeConversation.current = id }, [])
  const markReadLocal = useCallback((conversationId) => {
    setChats((prev) => prev.map((c) => (c.conversationId === conversationId && c.unread ? { ...c, unread: 0 } : c)))
  }, [])
  const setConversationId = useCallback((friendId, conversationId) => {
    setChats((prev) => prev.map((c) => (c.friendId === friendId && !c.conversationId ? { ...c, conversationId } : c)))
  }, [])
  const acceptRequest = useCallback(async (req) => {
    setRequests((r) => r.filter((x) => x.id !== req.id)) // optimistic
    try { await acceptFriendRequest(req.id) } finally { refresh() }
  }, [refresh])
  const declineRequest = useCallback(async (req) => {
    setRequests((r) => r.filter((x) => x.id !== req.id))
    try { await declineFriendRequest(req.id) } finally { refresh() }
  }, [refresh])

  const value = useMemo(
    () => ({
      chats, requests, status, error, totalUnread, refresh,
      setActiveConversation, markReadLocal, setConversationId, acceptRequest, declineRequest,
    }),
    [chats, requests, status, error, totalUnread, refresh, setActiveConversation, markReadLocal, setConversationId, acceptRequest, declineRequest],
  )

  return <ChatsContext.Provider value={value}>{children}</ChatsContext.Provider>
}
