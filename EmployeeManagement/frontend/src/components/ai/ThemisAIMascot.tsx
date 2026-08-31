import { useEffect, useId, useRef } from 'react'
import { canTrackMascotPointer, getMascotGaze, mascotMouth, type MascotExpression } from './mascotExpressions'
import './ThemisAIMascot.css'

export default function ThemisAIMascot({ expression = 'idle', compact = false }: {
  expression?: MascotExpression
  compact?: boolean
}) {
  const id = useId().replace(/:/g, '')
  const root = useRef<SVGSVGElement>(null)
  const gaze = useRef<SVGGElement>(null)

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    let frame: number | null = null
    let x = 0
    let y = 0
    const center = () => {
      gaze.current?.style.setProperty('--mascot-look-x', '0px')
      gaze.current?.style.setProperty('--mascot-look-y', '0px')
    }
    const cancel = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      center()
    }
    const update = () => {
      frame = null
      if (!root.current) return
      const bounds = root.current.getBoundingClientRect()
      const offset = getMascotGaze(x - bounds.left - bounds.width / 2, y - bounds.top - bounds.height / 2)
      gaze.current?.style.setProperty('--mascot-look-x', `${offset.x.toFixed(2)}px`)
      gaze.current?.style.setProperty('--mascot-look-y', `${offset.y.toFixed(2)}px`)
    }
    const move = (event: PointerEvent) => {
      if (!canTrackMascotPointer(expression, motion.matches, pointer.matches)
        || event.pointerType !== 'mouse' || document.hidden) return
      x = event.clientX
      y = event.clientY
      if (frame === null) frame = requestAnimationFrame(update)
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('blur', cancel)
    document.documentElement.addEventListener('pointerleave', cancel)
    document.addEventListener('visibilitychange', cancel)
    motion.addEventListener('change', cancel)
    pointer.addEventListener('change', cancel)
    return () => {
      cancel()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('blur', cancel)
      document.documentElement.removeEventListener('pointerleave', cancel)
      document.removeEventListener('visibilitychange', cancel)
      motion.removeEventListener('change', cancel)
      pointer.removeEventListener('change', cancel)
    }
  }, [expression])

  return (
    <svg ref={root} className={`themis-mascot${compact ? ' themis-mascot--compact' : ''}`}
      data-expression={expression} viewBox="0 0 96 96" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-body`} x1="26" y1="21" x2="67" y2="85" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34445d" /><stop offset=".48" stopColor="#162337" /><stop offset="1" stopColor="#0b1222" />
        </linearGradient>
        <linearGradient id={`${id}-face`} x1="40" y1="35" x2="52" y2="71" gradientUnits="userSpaceOnUse">
          <stop stopColor="#172737" /><stop offset=".55" stopColor="#070e1b" /><stop offset="1" stopColor="#101c2c" />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="21" y1="27" x2="78" y2="74" gradientUnits="userSpaceOnUse">
          <stop stopColor="#b9ccdc" stopOpacity=".65" /><stop offset=".5" stopColor="#577895" stopOpacity=".28" /><stop offset="1" stopColor="#7dd3fc" stopOpacity=".65" />
        </linearGradient>
        <clipPath id={`${id}-eye-left`}><ellipse cx="37" cy="51" rx="8" ry="10" /></clipPath>
        <clipPath id={`${id}-eye-right`}><ellipse cx="59" cy="50" rx="8" ry="10" /></clipPath>
      </defs>
      <ellipse className="themis-mascot-halo" cx="48" cy="85" rx="24" ry="3" fill="currentColor" />
      <g className="themis-mascot-float">
        <g className="themis-mascot-pose">
          <g className="themis-mascot-fin themis-mascot-fin--left">
            <path d="M23 46 C15 44 12 48 9 54 C7 59 10 68 15 68 L25 59Z" fill={`url(#${id}-body)`} stroke={`url(#${id}-rim)`} />
            <path d="M14 54 L16 60" stroke="#7dd3fc" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
          </g>
          <g className="themis-mascot-fin themis-mascot-fin--right">
            <path d="M73 45 C80 43 85 47 88 53 C91 59 87 65 83 66 L73 58Z" fill={`url(#${id}-body)`} stroke={`url(#${id}-rim)`} />
            <path d="M83 52 L82 58" stroke="#7dd3fc" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
          </g>
          <g className="themis-mascot-body">
            <path d="M24 33 C30 24 44 26 50 21 C54 18 56 13 55 10 C65 15 65 23 68 29 C78 34 81 47 79 63 C78 75 67 80 55 81 L48 87 L43 81 C28 81 19 74 17 62 C15 49 18 39 24 33Z"
              fill={`url(#${id}-body)`} stroke={`url(#${id}-rim)`} strokeWidth="1.4" />
            <path d="M29 32 Q38 28 48 28 Q58 25 58 21" stroke="#dbeafe" strokeOpacity=".22" strokeWidth="2" strokeLinecap="round" />
            <path d="M38 78 Q47 80 56 77" stroke="#67b7d3" strokeOpacity=".4" strokeLinecap="round" />
          </g>
          <g className="themis-mascot-face">
            <path d="M28 36 C38 32 61 32 69 37 C76 41 75 60 69 67 C61 74 35 74 27 68 C20 62 20 42 28 36Z"
              fill={`url(#${id}-face)`} stroke="#050b14" strokeWidth="2" />
            <path d="M28 37 Q45 32 65 36" stroke="#a5dff2" strokeOpacity=".25" strokeLinecap="round" />
            <path d="M25 41 Q39 35 52 37" stroke="#e0f2fe" strokeOpacity=".08" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g className="themis-mascot-eyes">
            <g className="themis-mascot-open-eyes">
              <g className="themis-mascot-blink">
                <g className="themis-mascot-eye-opening">
                  <ellipse cx="37" cy="51" rx="8" ry="10" fill="#e7f5fc" />
                  <ellipse cx="59" cy="50" rx="8" ry="10" fill="#e7f5fc" />
                  <g ref={gaze} className="themis-mascot-gaze">
                    <g className="themis-mascot-pupils">
                      {[{ x: 37, y: 51, side: 'left' }, { x: 59, y: 50, side: 'right' }].map(({ x, y, side }) => (
                        <g key={side} clipPath={`url(#${id}-eye-${side})`}>
                          <ellipse cx={x + 1} cy={y + 1} rx="4.2" ry="5.8" fill="#102c42" />
                          <ellipse cx={x + 1} cy={y + 1.5} rx="2.5" ry="3.8" fill="#060e19" />
                          <circle cx={x + 2.2} cy={y - 1.5} r="1.45" fill="white" />
                          <circle cx={x - .5} cy={y + 4} r=".7" fill="#7dd3fc" />
                        </g>
                      ))}
                    </g>
                  </g>
                </g>
                <g className="themis-mascot-concerned-lids" fill="#142333">
                  <path d="M28 39 L45 38 L45 43 L28 49Z" />
                  <path d="M50 38 L68 38 L68 48 L50 43Z" />
                </g>
              </g>
            </g>
            <g className="themis-mascot-happy-eyes" stroke="#e7f5fc" strokeWidth="3.3" strokeLinecap="round">
              <path d="M30 52 Q37 42 44 52" /><path d="M52 51 Q59 41 66 51" />
            </g>
          </g>
          <path className="themis-mascot-mouth" d={mascotMouth[expression]} stroke="#c4e5f3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill={expression === 'happy' ? '#9dd7e7' : 'none'} />
          <g className="themis-mascot-status">
            <circle cx="70" cy="72" r="5.5" fill="#111e2e" stroke="#476075" strokeWidth="1" />
            <circle className="themis-mascot-status-light" cx="70" cy="72" r="3" />
            <circle cx="69.3" cy="71.2" r=".8" fill="white" opacity=".65" />
          </g>
        </g>
        <g className="themis-mascot-thoughts" fill="#7cbcd7">
          <circle cx="70" cy="18" r="1.7" /><circle cx="78" cy="16" r="1.7" /><circle cx="86" cy="18" r="1.7" />
        </g>
        <g className="themis-mascot-sleep" stroke="#7cbcd7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M75 26 H81 L75 32 H81" />
        </g>
      </g>
    </svg>
  )
}
