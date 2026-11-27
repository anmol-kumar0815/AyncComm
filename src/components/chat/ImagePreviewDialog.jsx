import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { Dialog } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Spinner } from '../ui/spinner'
import { prepareImage, validateImageFile } from '../../lib/media'

/**
 * Shown after picking / pasting / dropping a photo. Compresses it in the
 * background, previews exactly what will be sent, and takes an optional caption.
 * Enter in the caption box sends, so the whole thing is: pick -> (type) -> Enter.
 */
export default function ImagePreviewDialog({ file, onSend, onClose }) {
  const [prepared, setPrepared] = useState(null) // { blob, width, height, mime, previewUrl }
  const [error, setError] = useState('')
  const [caption, setCaption] = useState('')

  useEffect(() => {
    let alive = true
    let previewUrl = null
    const invalid = validateImageFile(file)
    if (invalid) {
      Promise.resolve().then(() => alive && setError(invalid))
    } else {
      prepareImage(file)
        .then((p) => {
          if (!alive) return
          previewUrl = URL.createObjectURL(p.blob)
          setPrepared({ ...p, previewUrl })
        })
        .catch((e) => alive && setError(e.message))
    }
    return () => { alive = false; if (previewUrl) URL.revokeObjectURL(previewUrl) }
  }, [file])

  const submit = (e) => {
    e.preventDefault()
    if (!prepared) return
    onSend(prepared, caption.trim())
  }

  return (
    <Dialog open onClose={onClose} title="Send photo">
      <form onSubmit={submit} className="space-y-3">
        <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-xl bg-gray-100">
          {prepared ? (
            <img src={prepared.previewUrl} alt="Preview of the photo you're about to send" className="max-h-[50dvh] w-full object-contain" />
          ) : error ? (
            <p role="alert" className="px-4 py-10 text-center text-sm text-red-700">{error}</p>
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-gray-500"><Spinner className="h-6 w-6" /> Preparing photo…</div>
          )}
        </div>
        {!error && (
          <Input
            autoFocus
            maxLength={1000}
            placeholder="Add a caption (optional)"
            aria-label="Caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={!prepared}>
            <Send className="h-4 w-4" /> Send
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
