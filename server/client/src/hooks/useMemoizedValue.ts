import { useMemo, useRef } from 'react'

/**
 * Deep comparison memoization hook
 * オブジェクトの深い比較を行うメモ化フック
 */
export function useDeepMemo<T>(factory: () => T, deps: React.DependencyList): T {
  const ref = useRef<{ deps: React.DependencyList; value: T }>()
  
  if (!ref.current || !areEqual(ref.current.deps, deps)) {
    ref.current = { deps, value: factory() }
  }
  
  return ref.current.value
}

/**
 * Stable value hook that only updates when value actually changes
 * 値が実際に変更された時のみ更新される安定値フック
 */
export function useStableValue<T>(value: T): T {
  const ref = useRef<T>(value)
  
  if (!Object.is(ref.current, value)) {
    ref.current = value
  }
  
  return ref.current
}

/**
 * Memoized selector hook for complex computations
 * 複雑な計算用のメモ化セレクターフック
 */
export function useSelector<T, R>(
  source: T,
  selector: (source: T) => R,
  equalityFn?: (a: R, b: R) => boolean
): R {
  return useMemo(() => selector(source), [source, selector])
}

/**
 * Array equality comparison
 * 配列の等価性比較
 */
function areEqual(a: React.DependencyList, b: React.DependencyList): boolean {
  if (a.length !== b.length) return false
  
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false
  }
  
  return true
}

/**
 * Optimized list memoization
 * リストの最適化されたメモ化
 */
export function useMemoizedList<T>(
  list: T[],
  keyExtractor?: (item: T) => string | number
): T[] {
  const keyFn = keyExtractor || ((item: any) => item.id || JSON.stringify(item))
  
  return useMemo(() => {
    return list.slice()
  }, [list.map(keyFn).join(',')])
}

/**
 * Filtered list memoization
 * フィルタリングされたリストのメモ化
 */
export function useFilteredList<T>(
  list: T[],
  filter: (item: T) => boolean,
  deps?: React.DependencyList
): T[] {
  return useMemo(() => {
    return list.filter(filter)
  }, [list, filter, ...(deps || [])])
}
