export function getRevealGeometry(rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, width: number, height: number) {
  const x = Math.max(0, Math.min(width, rect.left + rect.width / 2))
  const y = Math.max(0, Math.min(height, rect.top + rect.height / 2))
  return { x, y, radius: Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) }
}

/** Presentation only: persistence and the actual theme update stay in ThemeContext. */
export function createThemeTransition() {
  let revision = 0
  let active: ViewTransition | undefined
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined

  const cancel = () => {
    revision += 1
    active?.skipTransition()
    active = undefined
    clearTimeout(fallbackTimer)
    document.documentElement.classList.remove('theme-revealing', 'theme-colors-changing')
  }

  const run = (commit: () => void, origin?: HTMLElement) => {
    cancel()
    const current = revision
    const root = document.documentElement
    const update = () => { if (current === revision) commit() }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const fallback = () => {
      if (current !== revision) return
      root.classList.remove('theme-revealing')
      if (!reducedMotion) {
        root.classList.add('theme-colors-changing')
        // Establish the old colors before applying the new theme in the same task.
        void window.getComputedStyle(root).backgroundColor
        fallbackTimer = setTimeout(() => {
          if (current === revision) root.classList.remove('theme-colors-changing')
        }, 300)
      }
      update()
    }

    if (reducedMotion || !origin || !document.startViewTransition || document.visibilityState === 'hidden') {
      fallback()
      return
    }

    const { x, y, radius } = getRevealGeometry(origin.getBoundingClientRect(), window.innerWidth, window.innerHeight)
    root.style.setProperty('--theme-reveal-x', `${x}px`)
    root.style.setProperty('--theme-reveal-y', `${y}px`)
    root.style.setProperty('--theme-reveal-radius', `${radius}px`)
    root.classList.add('theme-revealing')

    try {
      const transition = document.startViewTransition(update)
      active = transition
      // Skipped/unsupported snapshots must never prevent the real theme update.
      void transition.ready.catch(fallback)
      void transition.updateCallbackDone.catch(fallback)
      void transition.finished.catch(() => {}).finally(() => {
        if (current !== revision) return
        active = undefined
        root.classList.remove('theme-revealing')
      })
    } catch {
      fallback()
    }
  }

  return { run, cancel }
}
