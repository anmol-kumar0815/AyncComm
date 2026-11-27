import { supabase } from '../supabase'
import { friendlyError } from './errors'

const MESSAGES = {
  sent: { ok: true, text: (e) => `Invite sent to ${e}. They'll see it as soon as they open AsyncComm.` },
  accepted: { ok: true, text: (e) => `${e} had already invited you, so you're now friends!` },
  already_pending: { ok: false, text: (e) => `You've already invited ${e}. Waiting for them to accept.` },
  already_friends: { ok: false, text: (e) => `You're already friends with ${e}.` },
  self: { ok: false, text: () => "That's your own email address." },
  invalid_email: { ok: false, text: () => 'That email address doesn’t look right.' },
}

/** @returns {Promise<{ok: boolean, code: string, text: string}>} */
export async function sendFriendRequest(email) {
  const clean = email.trim().toLowerCase()
  const { data, error } = await supabase.rpc('send_friend_request', { p_email: clean })
  if (error) throw new Error(friendlyError(error, "Couldn't send the invite. Please try again."))
  const m = MESSAGES[data] ?? { ok: false, text: () => 'Something went wrong. Please try again.' }
  return { ok: m.ok, code: data, text: m.text(clean) }
}

export async function acceptFriendRequest(id) {
  const { error } = await supabase.rpc('accept_friend_request', { p_request_id: id })
  if (error) throw new Error(friendlyError(error, "Couldn't accept the request."))
}

export async function declineFriendRequest(id) {
  const { error } = await supabase.rpc('decline_friend_request', { p_request_id: id })
  if (error) throw new Error(friendlyError(error, "Couldn't decline the request."))
}

export async function fetchPendingRequests() {
  const { data, error } = await supabase.rpc('get_pending_requests')
  if (error) throw new Error(friendlyError(error))
  return (data ?? []).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    sender: { id: r.sender_id, email: r.sender_email, name: r.sender_name },
  }))
}
