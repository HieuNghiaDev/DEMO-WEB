import { Moon, Sparkle, Sun } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'

export default function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme()

  return (
    <button type="button" className="theme-toggle" data-mode={isDark ? 'dark' : 'light'}
      onClick={(event) => toggleTheme(event.currentTarget)}
      aria-label={isDark ? 'ライトモードに切り替える' : 'ダークモードに切り替える'}
      title={isDark ? 'ライトモード' : 'ダークモード'}>
      <span className="theme-icon-shell" aria-hidden="true">
        <span className="theme-icon-stack">
          <span className="theme-glyph theme-glyph-moon">
            <Moon size={16} strokeWidth={1.8} className="theme-night-moon" />
            <Sparkle size={7} strokeWidth={1.6} className="theme-night-sparkle" />
          </span>
          <Sun size={16} strokeWidth={1.8} className="theme-glyph theme-glyph-sun" />
        </span>
      </span>
    </button>
  )
}
