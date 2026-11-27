import React from 'react'
import { cn } from '../../lib/utils'

const variants = {
  default: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
  outline: 'border border-gray-300 bg-white hover:bg-gray-50 text-gray-900',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
  ghost: 'text-gray-700 hover:bg-gray-100',
  link: 'text-blue-600 underline-offset-4 hover:underline h-auto px-0',
}
const sizes = {
  default: 'h-11 px-4',
  sm: 'h-9 px-3 text-sm',
  lg: 'h-12 px-6 text-base',
  icon: 'h-11 w-11',
  'icon-sm': 'h-9 w-9',
}

const Button = React.forwardRef(({ className, variant = 'default', size = 'default', type = 'button', ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(
      'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-[15px] font-medium transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
      'disabled:pointer-events-none disabled:opacity-50',
      variants[variant],
      sizes[size],
      className,
    )}
    {...props}
  />
))
Button.displayName = 'Button'

export { Button }
