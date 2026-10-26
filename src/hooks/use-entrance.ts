import { useEffect, useRef } from 'react'
import gsap from 'gsap'
export function useEntrance() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const context = gsap.context(() => {
      gsap.from(ref.current, { opacity: 0, y: 8, duration: 0.3, clearProps: 'all' })
    }, ref)
    return () => context.revert()
  }, [])
  return ref
}
