import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react'
import { cn } from '../../lib/utils'

const LABEL = { pending: 'Sending', failed: 'Not sent', sent: 'Sent', delivered: 'Delivered', read: 'Read' }

/**
 * One tick = saved on the server, two grey ticks = delivered to their app,
 * two bright ticks = they've read it. The label is what screen readers (and the
 * colour-blind) get, so state never relies on colour alone.
 * `tone="on-blue"` is for my bubbles (blue background); `tone="plain"` for light backgrounds.
 */
export default function Ticks({ state, tone = 'on-blue', className }) {
  const common = cn('h-4 w-4', className)
  const grey = tone === 'on-blue' ? 'text-blue-200' : 'text-gray-400'
  const bright = tone === 'on-blue' ? 'text-emerald-300' : 'text-emerald-600'
  const label = LABEL[state]
  if (state === 'failed') return <AlertCircle className={cn(common, tone === 'on-blue' ? 'text-red-300' : 'text-red-600')} aria-label={label} />
  if (state === 'pending') return <Clock className={cn(common, grey)} aria-label={label} />
  if (state === 'sent') return <Check className={cn(common, grey)} aria-label={label} />
  return <CheckCheck className={cn(common, state === 'read' ? bright : grey)} aria-label={label} />
}
