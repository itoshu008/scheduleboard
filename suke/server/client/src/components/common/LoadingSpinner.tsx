import React, { memo } from 'react'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  message?: string
  className?: string
}

const LoadingSpinner = memo<LoadingSpinnerProps>(({ 
  size = 'md', 
  message = 'データを読み込んでいます...', 
  className = '' 
}) => {
  const sizeClasses = {
    sm: 'loading-spinner-sm',
    md: 'loading-spinner-md',
    lg: 'loading-spinner-lg',
  }

  return (
    <div className={`app-loading ${className}`}>
      <div className={`loading-spinner ${sizeClasses[size]}`}></div>
      {message && <p>{message}</p>}
    </div>
  )
})

LoadingSpinner.displayName = 'LoadingSpinner'

export default LoadingSpinner
