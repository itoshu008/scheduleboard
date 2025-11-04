import { useRef, useEffect } from 'react'

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>()
  
  useEffect(() => {
    ref.current = value
  })
  
  return ref.current
}

// Hook to compare if a value has changed
export function useChanged<T>(value: T): boolean {
  const previous = usePrevious(value)
  return previous !== value
}

// Hook to get both current and previous values
export function useCurrentAndPrevious<T>(value: T): [T, T | undefined] {
  const previous = usePrevious(value)
  return [value, previous]
}
