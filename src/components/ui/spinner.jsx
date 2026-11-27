import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

export const Spinner = ({ className, label = 'Loading' }) => (
  <Loader2 role="status" aria-label={label} className={cn('h-5 w-5 animate-spin text-gray-400', className)} />
)
