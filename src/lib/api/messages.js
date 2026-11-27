import { supabase } from '../supabase'
import { apiError, friendlyError } from './errors'
import { baseMime, createUrlCache, extFromMime } from '../media'

export const PAGE_SIZE = 40
export const BUCKET = 'chat-media'
const COLUMNS =
  'id, conversation_id, sender_id, content, media_type, media_path, media_mime, media_duration_ms, media_width, media_height, created_at'

/** Newest `limit` messages (optionally older than `before`), returned oldest-first. */
export async function fetchMessages(conversationId, { before, limit = PAGE_SIZE } = {}) {
  let q = supabase
    .from('messages')
    .select(COLUMNS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  if (before) q = q.lt('created_at', before)
  const { data, error } = await q
  if (error) throw new Error(friendlyError(error, "Couldn't load messages."))
  return { messages: (data ?? []).reverse(), hasMore: (data ?? []).length === limit }
}

/** Insert with a client-generated id so the realtime echo can be matched to the optimistic copy. */
export async function insertMessage(message) {
  const { data, error } = await supabase.from('messages').insert(message).select(COLUMNS).single()
  if (error) throw apiError(error, "Message couldn't be sent.")
  return data
}

/** Upload a Blob to the private bucket; returns the object path. */
export async function uploadChatMedia(conversationId, blob, mime) {
  const type = baseMime(mime || blob.type)
  const path = `${conversationId}/${crypto.randomUUID()}.${extFromMime(type)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: type,
    cacheControl: '31536000', // objects are immutable (random path)
    upsert: false,
  })
  if (error) throw new Error(friendlyError(error, "Couldn't upload the file."))
  return path
}

const urlCache = createUrlCache({
  sign: async (path) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
    if (error) throw new Error(friendlyError(error, "Couldn't load the file."))
    return data.signedUrl
  },
})
export const getMediaUrl = (path) => urlCache.get(path)
export const peekMediaUrl = (path) => urlCache.peek(path)
export const clearMediaUrls = () => urlCache.clear()

/** One message by id (used to confirm a send whose response we never saw). */
export async function fetchMessage(id) {
  const { data, error } = await supabase.from('messages').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new Error(friendlyError(error))
  return data
}
