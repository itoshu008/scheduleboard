import React, { memo } from 'react'

interface OptimizedButtonProps {
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  className?: string
  variant?: 'primary' | 'secondary' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
}

const OptimizedButton = memo<OptimizedButtonProps>(({ 
  onClick, 
  children, 
  disabled = false, 
  className = '',
  variant = 'primary',
  size = 'md'
}) => {
  const baseClasses = 'btn'
  const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
    success: 'btn-success',
  }
  const sizeClasses = {
    sm: 'btn-sm',
    md: '',
    lg: 'btn-lg',
  }

  const buttonClasses = [
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    className
  ].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
})

OptimizedButton.displayName = 'OptimizedButton'

export default OptimizedButton
