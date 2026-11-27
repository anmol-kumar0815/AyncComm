import { avatarColor, initials } from '../../lib/format'
import { cn } from '../../lib/utils'

const SIZES = { sm: 'h-9 w-9 text-sm', md: 'h-11 w-11 text-base', lg: 'h-12 w-12 text-lg' }

/** `online` adds a green dot (and a screen-reader label), used for friends who are here right now. */
export function Avatar({ name, seed, size = 'md', className, online = false }) {
  return (
    <div className="relative shrink-0">
      <div
        aria-hidden="true"
        className={cn('flex select-none items-center justify-center rounded-full font-semibold', SIZES[size], avatarColor(seed || name), className)}
      >
        {initials(name)}
      </div>
      {online && (
        <span role="img" aria-label="Online" className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
      )}
    </div>
  )
}
