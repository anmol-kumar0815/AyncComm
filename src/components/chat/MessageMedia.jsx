// Renders image / voice-note content. Filled in by the image and voice-note commits.
export default function MessageMedia({ message }) {
  return <p className="px-2 py-1 text-sm italic opacity-80">{message.media_type === 'image' ? '📷 Photo' : '🎤 Voice message'}</p>
}
