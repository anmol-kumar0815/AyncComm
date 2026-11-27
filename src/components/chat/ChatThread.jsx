import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import MessageList from './MessageList'
import Composer from './Composer'
import ImageLightbox from './ImageLightbox'
import ImagePreviewDialog from './ImagePreviewDialog'
import ChatHeader from './ChatHeader'
import MessageActionsDialog from './MessageActionsDialog'
import { useToast } from '../ui/toast'
import { useMessages } from '../../hooks/useMessages'
import { useChats } from '../../hooks/chatsContext'
import { useIsVisible } from '../../hooks/useVisibility'
import { markConversationRead } from '../../lib/api/chats'

/** The open conversation. Remounted (via key) per conversation so all state resets cleanly. */
export default function ChatThread({ conversationId, meId, friend }) {
  const { setActiveConversation, markReadLocal, refresh } = useChats()
  const visible = useIsVisible()
  const m = useMessages(conversationId, meId)
  const toast = useToast()
  const [actionsId, setActionsId] = useState(null) // message whose options dialog is open
  const [editingId, setEditingId] = useState(null)
  const [pickedImage, setPickedImage] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0) // dragenter/leave fire for every child element; count them

  useEffect(() => {
    setActiveConversation(conversationId)
    return () => setActiveConversation(null)
  }, [conversationId, setActiveConversation])

  // Mark as read when a message from them is on screen (tab visible), not merely received.
  const lastIncomingId = useMemo(() => m.messages.findLast((x) => x.sender_id !== meId && !x.pending)?.id, [m.messages, meId])
  const needsRead = m.status === 'ready' && visible && (lastIncomingId || friend.unread > 0)
  useEffect(() => {
    if (!needsRead) return
    const t = setTimeout(() => {
      markConversationRead(conversationId)
      markReadLocal(conversationId)
    }, 300)
    return () => clearTimeout(t)
  }, [needsRead, lastIncomingId, conversationId, markReadLocal])

  const actionsMessage = actionsId ? m.messages.find((x) => x.id === actionsId) : null
  const editingMessage = editingId ? m.messages.find((x) => x.id === editingId) : null
  const editing = editingMessage && !editingMessage.deleted_at ? { id: editingMessage.id, content: editingMessage.content } : null

  const saveEdit = (id, text) => {
    setEditingId(null)
    m.editMessage(id, text).catch((e) => toast.show(e.message))
  }
  const removeForEveryone = (id) => m.deleteMessage(id).catch((e) => toast.show(e.message))
  // The chat-list preview/unread count may have been showing the message we just removed.
  const removeForMe = (id) => m.hideMessage(id).then(() => refresh()).catch((e) => toast.show(e.message))

  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files')
  const dropHandlers = {
    onDragEnter: (e) => { if (hasFiles(e)) { dragDepth.current += 1; setDragging(true) } },
    onDragOver: (e) => { if (hasFiles(e)) e.preventDefault() },
    onDragLeave: (e) => { if (hasFiles(e) && --dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false) } },
    onDrop: (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))
      if (file && m.status === 'ready') setPickedImage(file)
    },
  }

  return (
    <>
    <ChatHeader friend={friend} typing={m.friendTyping} />
    <div className="relative flex min-h-0 flex-1 flex-col" {...dropHandlers}>
      <MessageList
        messages={m.messages}
        meId={meId}
        friendName={friend.name}
        status={m.status}
        error={m.error}
        hasMore={m.hasMore}
        loadingMore={m.loadingMore}
        onLoadEarlier={m.loadEarlier}
        onReload={m.reload}
        onRetry={m.retry}
        onDiscard={m.discard}
        onOpenImage={setLightbox}
        onOpenActions={setActionsId}
      />
      <Composer
        key={editing ? `edit-${editing.id}` : 'compose'}
        conversationId={conversationId}
        disabled={m.status !== 'ready'}
        onSendText={m.sendText}
        onPickImage={setPickedImage}
        onSendAudio={m.sendAudio}
        onTyping={m.notifyTyping}
        editing={editing}
        onSaveEdit={saveEdit}
        onCancelEdit={() => setEditingId(null)}
      />

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 border-4 border-dashed border-blue-400 bg-blue-50/90 text-blue-700">
          <ImagePlus className="h-10 w-10" />
          <p className="font-medium">Drop a photo to send it to {friend.name}</p>
        </div>
      )}

      {pickedImage && (
        // mounted only while a photo is selected, so caption/error state never leaks between picks
        <ImagePreviewDialog
          file={pickedImage}
          onClose={() => setPickedImage(null)}
          onSend={(prepared, caption) => { m.sendImage(prepared, caption); setPickedImage(null) }}
        />
      )}
      <ImageLightbox image={lightbox} onClose={() => setLightbox(null)} />

      {actionsMessage && (
        <MessageActionsDialog
          key={actionsMessage.id}
          message={actionsMessage}
          meId={meId}
          friendName={friend.name}
          onClose={() => setActionsId(null)}
          onEdit={setEditingId}
          onDeleteForEveryone={removeForEveryone}
          onDeleteForMe={removeForMe}
        />
      )}
    </div>
    </>
  )
}
