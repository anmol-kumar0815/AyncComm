import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Smile, Keyboard } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import EmojiPanel from './EmojiPanel'
import { insertAtCaret, MAX_MESSAGE_LENGTH, prepareText } from '../../lib/text'

const drafts = new Map() // conversationId -> unsent text, so switching chats doesn't lose what you typed
const MAX_HEIGHT = 140
const isTouchDevice = () => window.matchMedia?.('(pointer: coarse)').matches

export default function Composer({ conversationId, disabled, onSendText }) {
  const [text, setText] = useState(() => drafts.get(conversationId) ?? '')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const areaRef = useRef(null)
  const textRef = useRef(text)

  useEffect(() => {
    textRef.current = text
  }, [text])
  useEffect(() => {
    const id = conversationId
    return () => {
      const t = textRef.current
      if (t.trim()) drafts.set(id, t)
      else drafts.delete(id)
    }
  }, [conversationId])

  // Grow with the content up to ~5 lines, then scroll.
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [text])

  const canSend = prepareText(text) !== null && !disabled

  const send = useCallback(() => {
    const t = prepareText(textRef.current)
    if (!t || disabled) return
    onSendText(t)
    setText('')
    setEmojiOpen(false)
    areaRef.current?.focus()
  }, [disabled, onSendText])

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && emojiOpen) { setEmojiOpen(false); return }
    // Enter sends on desktop; on phones Enter is a newline (there's a Send button).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isTouchDevice()) {
      e.preventDefault()
      send()
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

  const toggleEmoji = () => {
    setEmojiOpen((open) => {
      // On phones, hide the keyboard while the emoji panel is up; tapping the box brings it back.
      if (!open && isTouchDevice()) areaRef.current?.blur()
      else if (open) areaRef.current?.focus()
      return !open
    })
  }

  return (
    <div className="bg-white">
      {emojiOpen && <EmojiPanel onPick={addEmoji} />}
      <div className="flex items-end gap-1.5 border-t border-gray-200 px-2 py-2 pb-safe md:px-4">
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

        <textarea
          ref={areaRef}
          value={text}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => { if (isTouchDevice()) setEmojiOpen(false) }}
          placeholder="Type a message"
          aria-label="Message"
          enterKeyHint="enter"
          className={cn(
            'min-h-11 flex-1 resize-none rounded-3xl bg-gray-100 px-4 py-[10px] text-base leading-6 text-gray-900',
            'placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
          )}
        />

        <Button size="icon" onClick={send} disabled={!canSend} aria-label="Send message" className="rounded-full">
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}
