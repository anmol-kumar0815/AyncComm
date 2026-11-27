import { useEffect, useRef } from 'react'
import { ExternalLink, X } from 'lucide-react'

/** Full-screen photo viewer. Esc, the X, or a click outside the photo closes it. */
export default function ImageLightbox({ image, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (image && el && !el.open) el.showModal()
  }, [image])
  if (!image) return null

  return (
    <dialog
      ref={ref}
      aria-label="Photo"
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget || e.target.dataset.backdrop) onClose() }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none bg-black/90 p-0 backdrop:bg-black"
    >
      <div data-backdrop="1" className="flex h-full w-full items-center justify-center p-4 pt-safe pb-safe">
        <img src={image.url} alt={image.alt} className="max-h-full max-w-full rounded-lg object-contain" />
      </div>
      <div className="absolute right-3 top-3 flex gap-2 pt-safe">
        <a
          href={image.url}
          target="_blank"
          rel="noreferrer"
          aria-label="Open original in a new tab"
          className="rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <ExternalLink className="h-5 w-5" />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close photo"
          className="rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </dialog>
  )
}
