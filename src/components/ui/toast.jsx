import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

const ToastContext = createContext({ show: () => {} })
// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext)

/** Short, non-blocking messages ("Couldn't access the microphone"). Announced to screen readers. */
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  const show = useCallback((text, type = 'error') => {
    clearTimeout(timer.current)
    setToast({ text, type, id: Date.now() })
    timer.current = setTimeout(() => setToast(null), type === 'error' ? 6000 : 3000)
  }, [])
  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[100] flex justify-center px-4">
        {toast && (
          <div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
            className="animate-slide-up pointer-events-auto flex max-w-md items-start gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-lg"
          >
            {toast.type === 'error' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />}
            <span>{toast.text}</span>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
