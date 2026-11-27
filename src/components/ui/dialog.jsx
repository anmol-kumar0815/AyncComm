import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * Modal built on the native <dialog>: focus is trapped, Esc closes, and the page
 * behind is inert for free. Bottom sheet on phones, centred card on desktop.
 */
export function Dialog({ open, onClose, title, children, className }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  if (!open) return null
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }} // click on the backdrop
      className={cn(
        'm-0 mt-auto w-full max-w-none bg-transparent p-0 backdrop:bg-black/40 sm:m-auto sm:max-w-md',
        'open:flex open:flex-col',
      )}
    >
      <div className={cn('animate-slide-up flex max-h-[85dvh] flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', className)}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 rounded-full p-2 text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5 pb-safe">{children}</div>
      </div>
    </dialog>
  )
}
