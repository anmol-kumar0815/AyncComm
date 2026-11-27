import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { deleteMessage as deleteMessageApi, editMessage as editMessageApi, fetchMessage, fetchMessages, insertMessage, uploadChatMedia } from '../lib/api/messages'
import { mergeCatchUp, mergeMessages } from '../lib/messages'

const TYPING_TIMEOUT_MS = 5000 // forget "typing…" if we stop hearing from them

const emptyRow = {
  content: '', media_type: 'text', media_path: null, media_mime: null,
  media_duration_ms: null, media_width: null, media_height: null,
}

/**
 * Everything about one open conversation: history, live updates, and sending.
 *
 * Sending is optimistic: the message appears immediately (pending), gets a
 * client-generated id, and is later replaced by the server copy. Realtime also
 * echoes our own insert back; matching ids make that a no-op instead of a duplicate.
 */
export function useMessages(conversationId, userId) {
  const [messages, setMessages] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [friendTyping, setFriendTyping] = useState(false)
  const typingTimer = useRef(null)
  const channelRef = useRef(null)
  const joined = useRef(false)
  const drafts = useRef(new Map()) // id -> { row, upload? } for retry
  const blobUrls = useRef(new Set())
  const merge = useCallback((rows) => setMessages((prev) => mergeMessages(prev, rows)), [])
  const shown = useRef([]) // latest rendered list, readable from async callbacks
  useEffect(() => { shown.current = messages })

  // ---- history + live updates ----
  const loadLatest = useCallback(async ({ initial }) => {
    try {
      const { messages: rows, hasMore: more } = await fetchMessages(conversationId)
      if (initial) {
        merge(rows)
        setHasMore(more)
        setStatus('ready')
        setError('')
      } else {
        // Catching up after being away: make sure we don't leave a hole in the history.
        // (functional update so a message queued in the same tick isn't lost; the flag only
        //  depends on confirmed messages, which the snapshot has)
        setMessages((prev) => mergeCatchUp(prev, rows, more).messages)
        const { hasMore: gap } = mergeCatchUp(shown.current, rows, more)
        if (gap !== null) setHasMore(gap)
      }
    } catch (e) {
      if (initial) { setStatus('error'); setError(e.message) }
      else console.warn('catch-up failed', e)
    }
  }, [conversationId, merge])

  useEffect(() => {
    loadLatest({ initial: true }) // eslint-disable-line react-hooks/set-state-in-effect -- fetching external data on mount
    let first = true
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        ({ new: row }) => {
          merge([row])
          if (row.sender_id !== userId) { clearTimeout(typingTimer.current); setFriendTyping(false) } // they sent it, so they're done typing
        },
      )
      // edits, deletes and receipts (delivered / read) all arrive as updates of the same row
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        ({ new: row }) => merge([row]),
      )
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.userId === userId) return
        clearTimeout(typingTimer.current)
        setFriendTyping(Boolean(payload?.typing))
        if (payload?.typing) typingTimer.current = setTimeout(() => setFriendTyping(false), TYPING_TIMEOUT_MS)
      })
      .subscribe((s) => {
        joined.current = s === 'SUBSCRIBED'
        if (s !== 'SUBSCRIBED') return
        if (first) first = false
        else loadLatest({ initial: false }) // reconnected: fetch what we missed
      })
    channelRef.current = channel
    const catchUp = () => document.visibilityState === 'visible' && loadLatest({ initial: false })
    document.addEventListener('visibilitychange', catchUp)
    window.addEventListener('online', catchUp)
    const urls = blobUrls.current
    return () => {
      clearTimeout(typingTimer.current)
      joined.current = false
      channelRef.current = null
      document.removeEventListener('visibilitychange', catchUp)
      window.removeEventListener('online', catchUp)
      supabase.removeChannel(channel)
      urls.forEach((u) => URL.revokeObjectURL(u))
      urls.clear()
    }
  }, [conversationId, userId, loadLatest, merge])

  const loadEarlier = useCallback(async () => {
    const oldest = messages.find((m) => !m.pending && !m.failed)
    if (!oldest || loadingMore) return
    setLoadingMore(true)
    try {
      const { messages: rows, hasMore: more } = await fetchMessages(conversationId, { before: oldest.created_at })
      merge(rows)
      setHasMore(more)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingMore(false)
    }
  }, [conversationId, messages, loadingMore, merge])

  // ---- sending ----
  const patch = useCallback((id, changes) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...changes } : m)))
  }, [])

  // Restore a message exactly as it was (a spread-merge can't remove keys the optimistic patch added).
  const replace = useCallback((id, message) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? message : m)))
  }, [])

  const deliver = useCallback(async (id) => {
    const draft = drafts.current.get(id)
    if (!draft) return
    patch(id, { pending: true, failed: false, error: null })
    try {
      if (draft.upload && !draft.row.media_path) {
        draft.row.media_path = await uploadChatMedia(conversationId, draft.upload.blob, draft.upload.mime)
      }
      let saved
      try {
        saved = await insertMessage(draft.row)
      } catch (e) {
        // Unique violation = an earlier attempt actually landed and we lost the response.
        if (e.code === '23505') saved = await fetchMessage(id)
        else throw e
      }
      drafts.current.delete(id)
      merge([saved])
    } catch (e) {
      patch(id, { pending: false, failed: true, error: e.message })
    }
  }, [conversationId, merge, patch])

  const enqueue = useCallback((fields, { upload, localUrl } = {}) => {
    const id = crypto.randomUUID()
    const row = { id, conversation_id: conversationId, sender_id: userId, ...emptyRow, ...fields }
    drafts.current.set(id, { row, upload })
    if (localUrl) blobUrls.current.add(localUrl)
    setMessages((prev) =>
      mergeMessages(prev, [{ ...row, created_at: new Date().toISOString(), pending: true, localUrl }]),
    )
    deliver(id)
    return id
  }, [conversationId, userId, deliver])

  const sendText = useCallback((text) => enqueue({ content: text, media_type: 'text' }), [enqueue])

  const sendImage = useCallback(({ blob, width, height, mime }, caption = '') => {
    const localUrl = URL.createObjectURL(blob)
    return enqueue(
      { content: caption, media_type: 'image', media_mime: mime, media_width: width, media_height: height },
      { upload: { blob, mime }, localUrl },
    )
  }, [enqueue])

  const sendAudio = useCallback(({ blob, mime, durationMs }) => {
    const localUrl = URL.createObjectURL(blob)
    return enqueue(
      { media_type: 'audio', media_mime: mime, media_duration_ms: durationMs },
      { upload: { blob, mime }, localUrl },
    )
  }, [enqueue])

  // Tell the other person we're typing (or stopped). Fire-and-forget: it's cosmetic.
  const notifyTyping = useCallback((typing) => {
    if (!joined.current) return
    channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { userId, typing } })
  }, [userId])

  // Edit / delete are optimistic: the bubble changes at once and is put back if the server says no.
  const editMessage = useCallback(async (id, text) => {
    const before = shown.current.find((m) => m.id === id)
    if (!before) return
    patch(id, { content: text, edited_at: new Date().toISOString() })
    try {
      merge([await editMessageApi(id, text)])
    } catch (e) {
      replace(id, before)
      throw e
    }
  }, [merge, patch, replace])

  const deleteMessage = useCallback(async (id) => {
    const before = shown.current.find((m) => m.id === id)
    if (!before) return
    patch(id, { deleted_at: new Date().toISOString(), content: null, media_path: null, localUrl: null })
    try {
      await deleteMessageApi(id)
    } catch (e) {
      replace(id, before)
      throw e
    }
  }, [patch, replace])

  const retry = useCallback((id) => deliver(id), [deliver])
  const discard = useCallback((id) => {
    drafts.current.delete(id)
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }, [])

  return { messages, status, error, hasMore, loadingMore, loadEarlier, reload: () => loadLatest({ initial: true }), sendText, sendImage, sendAudio, retry, discard, editMessage, deleteMessage, notifyTyping, friendTyping }
}
