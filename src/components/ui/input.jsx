import React from 'react'
import { cn } from '../../lib/utils'

// text-base (16px) on purpose: iOS Safari zooms the page when focusing an input smaller than that.
const Input = React.forwardRef(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-900',
      'placeholder:text-gray-400 transition-colors',
      'focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export { Input }
