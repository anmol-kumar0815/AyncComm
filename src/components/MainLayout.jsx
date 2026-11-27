import { Route, Routes, useMatch } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import ChatListPane from './chat/ChatListPane'
import ChatView from './chat/ChatView'
import { cn } from '../lib/utils'

/**
 * Phones: one pane at a time (list, or the open chat with a back button).
 * Desktop: list on the left, conversation on the right, like WhatsApp Web.
 * The list stays mounted so its scroll position and search survive opening a chat.
 */
export default function MainLayout({ user, profile, onProfileChanged }) {
  const inChat = Boolean(useMatch('/chat/:friendId'))
  return (
    <div className="flex h-dvh overflow-hidden bg-white">
      <aside className={cn('h-full w-full flex-col border-r border-gray-200 md:flex md:w-[380px] md:shrink-0', inChat ? 'hidden' : 'flex')}>
        <ChatListPane user={user} profile={profile} onProfileChanged={onProfileChanged} />
      </aside>
      <main className={cn('h-full min-w-0 flex-1 flex-col md:flex', inChat ? 'flex' : 'hidden')}>
        <Routes>
          <Route path="/chat/:friendId" element={<ChatView meId={user.id} />} />
          <Route path="*" element={<EmptyState />} />
        </Routes>
      </main>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-gray-50 px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
        <MessageCircle className="h-8 w-8" />
      </div>
      <h2 className="text-lg font-semibold text-gray-800">Pick a conversation</h2>
      <p className="mt-1 max-w-xs text-sm text-gray-500">Choose a friend on the left to start chatting.</p>
    </div>
  )
}
