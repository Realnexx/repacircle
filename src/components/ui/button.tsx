import type { ButtonHTMLAttributes } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'
export const buttonVariants = cva('button', {
  variants: {
    variant: {
      primary: 'button-primary',
      secondary: 'button-secondary',
      danger: 'button-danger',
      ghost: 'button-ghost',
    },
    size: { default: 'button-default', sm: 'button-sm', icon: 'button-icon' },
  },
  defaultVariants: { variant: 'primary', size: 'default' },
})
export function Button({
  className,
  variant = 'primary',
  size = 'default',
  asChild = false,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'default' | 'sm' | 'icon'
  asChild?: boolean
}) {
  const Component = asChild ? Slot : 'button'
  return (
    <Component
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
