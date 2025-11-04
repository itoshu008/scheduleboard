import { useEffect, useCallback } from 'react'

interface UseKeyboardOptions {
  preventDefault?: boolean
  stopPropagation?: boolean
  target?: HTMLElement | Document | Window
}

export function useKeyboard(
  key: string | string[],
  handler: (event: KeyboardEvent) => void,
  options: UseKeyboardOptions = {}
) {
  const { preventDefault = false, stopPropagation = false, target = document } = options
  
  const handleKeyPress = useCallback(
    (event: Event) => {
      const keyboardEvent = event as KeyboardEvent
      const keys = Array.isArray(key) ? key : [key]
      
      if (keys.includes(keyboardEvent.key) || keys.includes(keyboardEvent.code)) {
        if (preventDefault) {
          keyboardEvent.preventDefault()
        }
        if (stopPropagation) {
          keyboardEvent.stopPropagation()
        }
        handler(keyboardEvent)
      }
    },
    [key, handler, preventDefault, stopPropagation]
  )
  
  useEffect(() => {
    const element = target as EventTarget
    element.addEventListener('keydown', handleKeyPress)
    
    return () => {
      element.removeEventListener('keydown', handleKeyPress)
    }
  }, [handleKeyPress, target])
}

// Specialized hooks for common key combinations
export function useEscapeKey(handler: () => void) {
  useKeyboard('Escape', handler)
}

export function useEnterKey(handler: () => void) {
  useKeyboard('Enter', handler)
}

export function useArrowKeys(handlers: {
  onArrowUp?: () => void
  onArrowDown?: () => void
  onArrowLeft?: () => void
  onArrowRight?: () => void
}) {
  useKeyboard(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'], (event) => {
    switch (event.key) {
      case 'ArrowUp':
        handlers.onArrowUp?.()
        break
      case 'ArrowDown':
        handlers.onArrowDown?.()
        break
      case 'ArrowLeft':
        handlers.onArrowLeft?.()
        break
      case 'ArrowRight':
        handlers.onArrowRight?.()
        break
    }
  })
}

export function useHotkeys(hotkeys: Record<string, () => void>) {
  useKeyboard(Object.keys(hotkeys), (event) => {
    const handler = hotkeys[event.key] || hotkeys[event.code]
    if (handler) {
      handler()
    }
  })
}
