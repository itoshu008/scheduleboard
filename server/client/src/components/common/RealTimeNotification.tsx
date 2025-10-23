import React, { memo, useState, useEffect } from 'react'

interface RealTimeNotificationProps {
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  duration?: number
  onClose?: () => void
}

const RealTimeNotification = memo<RealTimeNotificationProps>(({
  message,
  type,
  duration = 3000,
  onClose,
}) => {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => {
        onClose?.()
      }, 300) // フェードアウト時間
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  const colors = {
    info: { bg: '#3b82f6', border: '#2563eb' },
    success: { bg: '#22c55e', border: '#16a34a' },
    warning: { bg: '#f59e0b', border: '#d97706' },
    error: { bg: '#ef4444', border: '#dc2626' },
  }

  const icons = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  }

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 80,
        right: 10,
        zIndex: 10000,
        background: colors[type].bg,
        color: 'white',
        border: `2px solid ${colors[type].border}`,
        borderRadius: 8,
        padding: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        fontSize: 14,
        maxWidth: 300,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'all 0.3s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{icons[type]}</span>
        <span>{message}</span>
        <button
          onClick={() => {
            setVisible(false)
            setTimeout(() => onClose?.(), 300)
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'white',
            fontSize: 16,
            cursor: 'pointer',
            marginLeft: 'auto',
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
})

RealTimeNotification.displayName = 'RealTimeNotification'

export default RealTimeNotification
