import { useEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
  delayMs?: number
  id?: string
}

export default function VisaScrollReveal({ children, className = '', delayMs = 0, id }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const panel = panelRef.current

    if (!panel || !('IntersectionObserver' in window)) {
      setIsVisible(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Once visible, mark permanently and stop observing to avoid flicker on scroll-back
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -4% 0px' },
    )

    observer.observe(panel)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={panelRef}
      id={id}
      style={{ transitionDelay: isVisible ? `${delayMs}ms` : '0ms' }}
      className={`${className} transition-[transform,opacity,border-color,box-shadow] duration-500 ease-out motion-reduce:transform-none motion-reduce:transition-none ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}
    >
      {children}
    </div>
  )
}
