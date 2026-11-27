import { avatarColor, initials } from '../../lib/format'
import { cn } from '../../lib/utils'

const SIZES = { sm: 'h-9 w-9 text-sm', md: 'h-11 w-11 text-base', lg: 'h-12 w-12 text-lg' }

export function Avatar({ name, seed, size = 'md', className }) {
  return (
    <div
      aria-hidden="true"
      className={cn('flex shrink-0 select-none items-center justify-center rounded-full font-semibold', SIZES[size], avatarColor(seed || name), className)}
    >
      {initials(name)}
    </div>
  )
}
