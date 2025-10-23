import React, { memo } from 'react'

interface ErrorDisplayProps {
  error: string
  onRetry?: () => void
  className?: string
}

const ErrorDisplay = memo<ErrorDisplayProps>(({ 
  error, 
  onRetry, 
  className = '' 
}) => {
  return (
    <div className={`app-error ${className}`}>
      <h2>エラーが発生しました</h2>
      <p>{error}</p>
      <div className="error-actions">
        {onRetry && (
          <button className="btn btn-primary" onClick={onRetry}>
            再試行
          </button>
        )}
        <button 
          className="btn btn-secondary" 
          onClick={() => window.location.reload()}
        >
          再読み込み
        </button>
      </div>
    </div>
  )
})

ErrorDisplay.displayName = 'ErrorDisplay'

export default ErrorDisplay
