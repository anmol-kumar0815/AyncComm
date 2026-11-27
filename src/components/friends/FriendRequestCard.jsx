import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Avatar } from '../ui/avatar'
import { Button } from '../ui/button'
import { useChats } from '../../hooks/chatsContext'
import { useToast } from '../ui/toast'

/** A pending invite, answerable in one tap right where it appears (top of the chat list). */
export default function FriendRequestCard({ request }) {
  const { acceptRequest, declineRequest } = useChats()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const { sender } = request

  const respond = async (accept) => {
    setBusy(true)
    try {
      if (accept) {
        await acceptRequest(request)
        toast.show(`You and ${sender.name} are now friends.`, 'success')
      } else {
        await declineRequest(request)
      }
    } catch (e) {
      toast.show(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
      <Avatar name={sender.name} seed={sender.email} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-gray-900">{sender.name}</p>
        <p className="truncate text-xs text-gray-500">wants to be friends · {sender.email}</p>
      </div>
      <Button size="icon-sm" disabled={busy} onClick={() => respond(true)} aria-label={`Accept ${sender.name}`}>
        <Check className="h-4 w-4" />
      </Button>
      <Button size="icon-sm" variant="outline" disabled={busy} onClick={() => respond(false)} aria-label={`Decline ${sender.name}`}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
