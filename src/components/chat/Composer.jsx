import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ImagePlus, Mic, Pencil, Send, Smile, Keyboard, X } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import EmojiPanel from './EmojiPanel'
import VoiceRecorderBar from './VoiceRecorderBar'
import { useToast } from '../ui/toast'
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder'
import { insertAtCaret, MAX_MESSAGE_LENGTH, prepareText } from '../../lib/text'

const drafts = new Map() // conversationId -> unsent text, so switching chats doesn't lose what you typed
const MAX_HEIGHT = 140
const TYPING_RESEND_MS = 3000 // while someone keeps typing, tell the other side at most this often
const isTouchDevice = () => window.matchMedia?.('(pointer: coarse)').matches

/**
 * `editing` ({ id, content }) switches the box into "edit this message" mode: pre-filled, Enter saves,
 * Esc cancels, no photo/voice buttons. The parent remounts us (key) when that changes, so normal
 * drafts are untouched by an edit.
 */
export default function Composer({ conversationId, disabled, onSendText, onPickImage, onSendAudio, onTyping, editing = null, onSaveEdit, onCancelEdit }) {
  const toast = useToast()
  const isEditing = Boolean(editing)
  const [text, setText] = useState(() => (editing ? editing.content : drafts.get(conversationId) ?? ''))
  const typingSentAt = useRef(0)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const areaRef = useRef(null)
  const fileRef = useRef(null)
  const textRef = useRef(text)

  useEffect(() => {
    textRef.current = text
  }, [text])
  useEffect(() => {
    if (isEditing) return // an edit in progress is not a draft
    const id = conversationId
    return () => {
      const t = textRef.current
      if (t.trim()) drafts.set(id, t)
      else drafts.delete(id)
    }
  }, [conversationId, isEditing])

  // Grow with the content up to ~5 lines, then scroll.
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [text])

  const canSend = prepareText(text) !== null && !disabled

  const deliverRecording = useCallback((result) => {
    if (!result) return
    if (result.tooShort) toast.show('Voice note too short. Tap the microphone and keep talking.', 'info')
    else onSendAudio(result)
  }, [onSendAudio, toast])
  const recorder = useVoiceRecorder({
    onAutoStop: (result) => { deliverRecording(result); if (result?.blob) toast.show('Reached the 5 minute limit, so your voice note was sent.', 'success') },
  })
  const startRecording = async () => {
    setEmojiOpen(false)
    const r = await recorder.start()
    if (!r.ok && r.error) toast.show(r.error)
  }
  const sendRecording = useCallback(async () => deliverRecording(await recorder.stop()), [deliverRecording, recorder])

  const stopTyping = useCallback(() => {
    if (typingSentAt.current) { typingSentAt.current = 0; onTyping?.(false) }
  }, [onTyping])

  const send = useCallback(() => {
    const t = prepareText(textRef.current)
    if (!t || disabled) return
    if (editing) {
      if (t === editing.content) onCancelEdit() // nothing changed: just leave edit mode
      else onSaveEdit(editing.id, t)
      return
    }
    onSendText(t)
    stopTyping()
    setText('')
    setEmojiOpen(false)
    areaRef.current?.focus()
  }, [disabled, onSendText, editing, onSaveEdit, onCancelEdit, stopTyping])

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (emojiOpen) setEmojiOpen(false)
      else if (isEditing) onCancelEdit()
      return
    }
    // Enter sends on desktop; on phones Enter is a newline (there's a Send button).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isTouchDevice()) {
      e.preventDefault()
      send()
    }
  }

  // Typing indicator: "typing" at most every few seconds while there is text, "stopped" when the box empties.
  const onChange = (e) => {
    const value = e.target.value
    setText(value)
    if (isEditing || !onTyping) return
    if (value.trim()) {
      const now = Date.now()
      if (now - typingSentAt.current > TYPING_RESEND_MS) { typingSentAt.current = now; onTyping(true) }
    } else {
      stopTyping()
    }
  }

  const addEmoji = (emoji) => {
    const el = areaRef.current
    const { text: next, caret } = insertAtCaret(text, el?.selectionStart, el?.selectionEnd, emoji)
    setText(next)
    if (!isTouchDevice()) {
      requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(caret, caret) })
    } else {
      requestAnimationFrame(() => el?.setSelectionRange(caret, caret))
    }
  }

  const onFileChosen = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow choosing the same file again later
    if (file) onPickImage(file)
  }

  // Pasting a screenshot / copied image straight into the box.
  const onPaste = (e) => {
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
    if (file) { e.preventDefault(); onPickImage(file) }
  }

  const toggleEmoji = () => {
    // On phones, hide the keyboard while the emoji panel is up (tapping the box brings it back);
    // on desktop keep typing focus where it was.
    if (emojiOpen) areaRef.current?.focus()
    else if (isTouchDevice()) areaRef.current?.blur()
    setEmojiOpen(!emojiOpen)
  }

  if (recorder.phase === 'recording') {
    return <VoiceRecorderBar elapsedMs={recorder.elapsedMs} level={recorder.level} onCancel={recorder.cancel} onSend={sendRecording} />
  }

  return (
    <div className="bg-white">
      {emojiOpen && <EmojiPanel onPick={addEmoji} />}
      {isEditing && (
        <div className="flex items-center gap-2 border-t border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-900">
          <Pencil className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 font-medium">Editing message</span>
          <button type="button" onClick={onCancelEdit} aria-label="Cancel editing" className="rounded-full p-1 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-1.5 border-t border-gray-200 px-2 pt-2 [--pad-b:0.5rem] pb-safe md:px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleEmoji}
          aria-label={emojiOpen ? 'Show keyboard' : 'Insert emoji'}
          aria-pressed={emojiOpen}
          className="text-gray-500"
        >
          {emojiOpen ? <Keyboard className="h-6 w-6" /> : <Smile className="h-6 w-6" />}
        </Button>

        {!isEditing && (
          <>
            <Button variant="ghost" size="icon" disabled={disabled} onClick={() => fileRef.current?.click()} aria-label="Send a photo" className="text-gray-500">
              <ImagePlus className="h-6 w-6" />
            </Button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onFileChosen} />
          </>
        )}

        <textarea
          ref={areaRef}
          value={text}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={onChange}
          autoFocus={isEditing}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={() => { if (isTouchDevice()) setEmojiOpen(false) }}
          placeholder={isEditing ? 'Edit your message' : 'Type a message'}
          aria-label={isEditing ? 'Edit message' : 'Message'}
          enterKeyHint="enter"
          className={cn(
            'min-h-11 flex-1 resize-none rounded-3xl bg-gray-100 px-4 py-[10px] text-base leading-6 text-gray-900',
            'placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
          )}
        />

        {/* One slot, two jobs: microphone while the box is empty, send once there's text. */}
        {isEditing ? (
          <Button size="icon" onClick={send} disabled={!canSend} aria-label="Save changes" className="rounded-full">
            <Check className="h-5 w-5" />
          </Button>
        ) : text.trim() ? (
          <Button size="icon" onClick={send} disabled={!canSend} aria-label="Send message" className="rounded-full">
            <Send className="h-5 w-5" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={startRecording}
            disabled={disabled || recorder.phase === 'starting'}
            aria-label="Record a voice note"
            className="rounded-full"
          >
            <Mic className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  )
}
