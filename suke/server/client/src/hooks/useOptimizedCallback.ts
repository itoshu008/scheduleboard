import { useCallback, useRef } from 'react'

/**
 * useCallback with automatic dependency tracking
 * より安全で使いやすいuseCallbackの代替
 */
export function useOptimizedCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps?: React.DependencyList
): T {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  return useCallback(
    ((...args: Parameters<T>) => callbackRef.current(...args)) as T,
    deps || []
  )
}

/**
 * Event handler optimization hook
 * イベントハンドラーを最適化するためのフック
 */
export function useEventHandler<T extends (...args: any[]) => any>(
  handler: T
): T {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  return useCallback(
    ((...args: Parameters<T>) => handlerRef.current(...args)) as T,
    []
  )
}

/**
 * Stable callback that never changes reference
 * 参照が変わらない安定したコールバック
 */
export function useStableCallback<T extends (...args: any[]) => any>(
  callback: T
): T {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  const stableCallback = useRef<T>()
  if (!stableCallback.current) {
    stableCallback.current = ((...args: Parameters<T>) => 
      callbackRef.current(...args)
    ) as T
  }

  return stableCallback.current
}
