import ThemisHead from './ThemisHead'
import type { ThemisActivity, ThemisExpression } from './mascotExpressions'

type ThemisAIMascotProps = {
  expression?: ThemisExpression
  activity?: ThemisActivity
  action?: ThemisActivity
  compact?: boolean
  interactive?: boolean
  className?: string
}

/** Compatibility wrapper used by existing AI surfaces. */
export default function ThemisAIMascot({ expression = 'idle', activity, action = 'none', compact = false, interactive = true, className = '' }: ThemisAIMascotProps) {
  return <ThemisHead activity={activity ?? action} className={`${compact ? 'themis-head--compact ' : ''}${className}`.trim()} expression={expression} interactive={interactive} />
}

export { ThemisAIMascot }
