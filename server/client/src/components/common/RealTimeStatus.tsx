import React, { memo } from 'react'

interface RealTimeStatusProps {
  isConnected: boolean
  lastUpdated: Date | null
  retryCount: number
  maxRetries: number
  connectionError: string | null
  onManualRefresh: () => void
  onToggleRealTime: () => void
}

const RealTimeStatus = memo<RealTimeStatusProps>(({
  isConnected,
  lastUpdated,
  retryCount,
  maxRetries,
  connectionError,
  onManualRefresh,
  onToggleRealTime,
}) => {
  const statusColor = isConnected ? '#22c55e' : '#ef4444'
  const statusText = isConnected ? 'リアルタイム接続中' : '接続停止'
  
  return (
    <div 
      style={{
        position: 'fixed',
        top: 10,
        left: 10,
        zIndex: 9999,
        background: 'white',
        border: `2px solid ${statusColor}`,
        borderRadius: 8,
        padding: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        fontSize: 12,
        fontFamily: 'monospace',
        minWidth: 250,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div 
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: statusColor,
            marginRight: 8,
            animation: isConnected ? 'pulse 2s infinite' : 'none',
          }}
        />
        <strong style={{ color: statusColor }}>{statusText}</strong>
      </div>

      {lastUpdated && (
        <div style={{ marginBottom: 4, color: '#666' }}>
          最終更新: {lastUpdated.toLocaleTimeString()}
        </div>
      )}

      {connectionError && (
        <div style={{ marginBottom: 8, color: '#ef4444', fontSize: 10 }}>
          {connectionError}
        </div>
      )}

      {retryCount > 0 && (
        <div style={{ marginBottom: 8, color: '#f59e0b', fontSize: 10 }}>
          リトライ: {retryCount}/{maxRetries}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onManualRefresh}
          style={{
            padding: '4px 8px',
            border: '1px solid #3b82f6',
            borderRadius: 4,
            background: '#3b82f6',
            color: 'white',
            fontSize: 10,
            cursor: 'pointer',
          }}
        >
          🔄 手動更新
        </button>
        
        <button
          onClick={onToggleRealTime}
          style={{
            padding: '4px 8px',
            border: `1px solid ${statusColor}`,
            borderRadius: 4,
            background: isConnected ? '#ef4444' : '#22c55e',
            color: 'white',
            fontSize: 10,
            cursor: 'pointer',
          }}
        >
          {isConnected ? '⏸️ 停止' : '▶️ 開始'}
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
})

RealTimeStatus.displayName = 'RealTimeStatus'

export default RealTimeStatus
