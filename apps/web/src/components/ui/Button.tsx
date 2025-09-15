'use client'

import React from 'react'
import { cn } from '../../lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'xs' | 'icon'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const baseClasses = 'btn'
    const variantClasses = {
      default: '',
      primary: 'btn-primary',
      secondary: 'btn-secondary', 
      outline: 'btn-outline',
      ghost: 'btn-ghost',
      destructive: 'btn-destructive',
      link: 'btn-link'
    }
    const sizeClasses = {
      default: '',
      sm: 'btn-sm',
      lg: 'btn-lg',
      xs: 'btn-xs',
      icon: 'btn-icon'
    }

    return (
      <button
        className={cn(
          baseClasses,
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'

export { Button }
