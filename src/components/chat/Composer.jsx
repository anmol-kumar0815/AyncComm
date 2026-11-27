import { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus, Mic, Send, Smile, Keyboard } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import EmojiPanel from './EmojiPanel'
import VoiceRecorderBar from './VoiceRecorderBar'
import { useToast } from '../ui/toast'
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder'
import { insertAtCaret, MAX_MESSAGE_LENGTH, prepareText } from '../../lib/text'

const drafts = new Map() // conversationId -> unsent text, so switching chats doesn't lose what you typed
const MAX_HEIGHT = 140
const isTouchDevice = () => window.matchMedia?.('(pointer: coarse)').matches

export default function Composer({ conversationId, disabled, onSendText, onPickImage, onSendAudio }) {
  const toast = useToast()
  const [text, setText] = useState(() => drafts.get(conversationId) ?? '')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const areaRef = useRef(null)
  const fileRef = useRef(null)
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

        <Button variant="ghost" size="icon" disabled={disabled} onClick={() => fileRef.current?.click()} aria-label="Send a photo" className="text-gray-500">
          <ImagePlus className="h-6 w-6" />
        </Button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onFileChosen} />

        <textarea
          ref={areaRef}
          value={text}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={() => { if (isTouchDevice()) setEmojiOpen(false) }}
          placeholder="Type a message"
          aria-label="Message"
          enterKeyHint="enter"
          className={cn(
            'min-h-11 flex-1 resize-none rounded-3xl bg-gray-100 px-4 py-[10px] text-base leading-6 text-gray-900',
            'placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
          )}
        />

        {/* One slot, two jobs: microphone while the box is empty, send once there's text. */}
        {text.trim() ? (
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
