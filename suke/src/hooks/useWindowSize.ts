import { useState, useEffect } from 'react'

interface WindowSize {
  width: number
  height: number
}

export function useWindowSize(): WindowSize {
  const [windowSize, setWindowSize] = useState<WindowSize>({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  })
  
  useEffect(() => {
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }
    
    window.addEventListener('resize', handleResize)
    
    // Call handler right away so state gets updated with initial window size
    handleResize()
    
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  return windowSize
}

// Specialized hook for responsive breakpoints
export function useBreakpoint() {
  const { width } = useWindowSize()
  
  return {
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
    isLarge: width >= 1280,
    isXLarge: width >= 1536,
    width,
  }
}
