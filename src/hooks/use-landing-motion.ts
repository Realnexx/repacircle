import { useEffect, useRef } from 'react'
import gsap from 'gsap'

// AOS has no public destroy API: initialize its global listeners once, then
// refresh its registry when the landing page mounts or its content changes.
let aosReady: Promise<typeof import('aos')> | undefined
function loadAos() {
  return (aosReady ??= import('aos').then(({ default: AOS }) => {
    AOS.init({
      startEvent: 'repacircle:motion-ready',
      once: true,
      mirror: false,
      offset: 60,
      duration: 650,
      disableMutationObserver: true,
    })
    document.dispatchEvent(new Event('repacircle:motion-ready'))
    return AOS
  }))
}

export function useLandingMotion() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let disposed = false
    let context: gsap.Context | undefined
    let refresh: (() => void) | undefined
    let frame = 0
    const update = () => {
      context?.revert()
      root.classList.remove('landing-motion-enabled')
      if (preference.matches) return
      context = gsap.context(() => {
        gsap.from('.hero-reveal', {
          opacity: 0,
          y: 22,
          duration: 0.8,
          stagger: 0.1,
          ease: 'power3.out',
          clearProps: 'all',
        })
        gsap.from('.landing-circle-scene', {
          opacity: 0,
          scale: 0.94,
          duration: 1.1,
          delay: 0.2,
          ease: 'power2.out',
          clearProps: 'all',
        })
        gsap.fromTo(
          '.landing-orbit-track',
          { rotation: -25 },
          { rotation: 0, duration: 2.6, ease: 'power2.out', clearProps: 'all' },
        )
        gsap.from('.circle-role-chip', {
          y: 14,
          opacity: 0,
          duration: 0.7,
          delay: 0.6,
          stagger: 0.15,
          clearProps: 'all',
        })
      }, root)
      void loadAos()
        .then((AOS) => {
          if (disposed || preference.matches) return
          refresh = () => AOS.refresh()
          AOS.refreshHard()
          root.classList.add('landing-motion-enabled')
        })
        .catch(() => {
          aosReady = undefined
          root.classList.remove('landing-motion-enabled')
        })
    }
    update()
    preference.addEventListener('change', update)
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => refresh?.())
          })
    observer?.observe(root)
    return () => {
      disposed = true
      context?.revert()
      root.classList.remove('landing-motion-enabled')
      preference.removeEventListener('change', update)
      observer?.disconnect()
      cancelAnimationFrame(frame)
      void aosReady?.then((AOS) => AOS.refreshHard()).catch(() => {})
    }
  }, [])
  return ref
}
