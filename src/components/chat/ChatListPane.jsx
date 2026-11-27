import { useMemo, useState } from 'react'
import { Search, UserPlus } from 'lucide-react'
import { Avatar } from '../ui/avatar'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { Spinner } from '../ui/spinner'
import ChatListItem from './ChatListItem'
import AddFriendForm from '../friends/AddFriendForm'
import FriendRequestCard from '../friends/FriendRequestCard'
import SettingsDialog from '../settings/SettingsDialog'
import { useChats } from '../../hooks/chatsContext'

export default function ChatListPane({ user, profile, onProfileChanged }) {
  const { chats, requests, status, error, refresh } = useChats()
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const name = profile?.display_name || user.email

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return chats
    return chats.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
  }, [chats, query])

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex items-center justify-between px-4 pb-2 pt-4 pt-safe">
        <h1 className="text-2xl font-bold tracking-tight">Chats</h1>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setAdding(true)} aria-label="Add a friend">
            <UserPlus className="h-5 w-5" />
          </Button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings and account"
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <Avatar name={name} seed={user.email} size="sm" />
          </button>
        </div>
      </header>

      {chats.length > 5 && (
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search friends"
              aria-label="Search friends"
              className="h-10 w-full rounded-full bg-gray-100 pl-9 pr-3 text-base placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {requests.length > 0 && (
          <section aria-label="Friend requests" className="space-y-2 px-4 pb-3 pt-1">
            {requests.map((r) => <FriendRequestCard key={r.id} request={r} />)}
          </section>
        )}

        {status === 'loading' && (
          <div className="flex justify-center py-16"><Spinner className="h-6 w-6" label="Loading chats" /></div>
        )}

        {status === 'error' && (
          <div className="px-6 py-16 text-center">
            <p className="text-gray-600">{error || "Couldn't load your chats."}</p>
            <Button variant="outline" className="mt-4" onClick={refresh}>Try again</Button>
          </div>
        )}

        {status === 'ready' && chats.length === 0 && (
          <div className="px-6 py-10">
            <h2 className="text-lg font-semibold">Add your first friend</h2>
            <p className="mb-5 mt-1 text-sm text-gray-500">
              Enter their email to send an invite. Once they accept, you can start chatting.
            </p>
            <AddFriendForm />
          </div>
        )}

        {status === 'ready' && chats.length > 0 && visible.length === 0 && (
          <p className="px-6 py-16 text-center text-gray-500">No friends match “{query}”.</p>
        )}

        {visible.length > 0 && (
          <nav aria-label="Conversations">
            <ul className="divide-y divide-gray-100">
              {visible.map((c) => <li key={c.friendId}><ChatListItem chat={c} meId={user.id} /></li>)}
            </ul>
          </nav>
        )}
      </div>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add a friend">
        <p className="mb-4 text-sm text-gray-500">
          We'll send them an invite. If they're not on AsyncComm yet, they'll see it when they join.
        </p>
        <AddFriendForm autoFocus />
      </Dialog>

      <SettingsDialog
        key={profile?.display_name /* re-seed the name field after a save */}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={user}
        profile={profile}
        onProfileChanged={onProfileChanged}
      />
    </div>
  )
}
