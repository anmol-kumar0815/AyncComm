import { lazy, Suspense } from 'react'
import { Spinner } from '../ui/spinner'

// ~200 KB of emoji data: only downloaded the first time someone opens the panel.
const Picker = lazy(() => import('emoji-picker-react'))

export default function EmojiPanel({ onPick }) {
  return (
    <div className="animate-slide-up border-t border-gray-200 bg-white">
      <Suspense fallback={<div className="flex h-[300px] items-center justify-center"><Spinner label="Loading emoji" /></div>}>
        <Picker
          onEmojiClick={(e) => onPick(e.emoji)}
          emojiStyle="native" // system emoji: no images fetched from a CDN
          width="100%"
          height={300}
          lazyLoadEmojis
          skinTonesDisabled={false}
          previewConfig={{ showPreview: false }}
          searchPlaceholder="Search emoji"
        />
      </Suspense>
    </div>
  )
}
