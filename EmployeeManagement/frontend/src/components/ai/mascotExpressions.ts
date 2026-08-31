export type MascotExpression = 'idle' | 'hover' | 'happy' | 'thinking' | 'sad' | 'sleepy'

export const MASCOT_SLEEP_DELAY = 55_000
export const MASCOT_FEEDBACK_DURATION = { happy: 1_500, sad: 2_400 } as const

export const mascotMouth: Record<MascotExpression, string> = {
  idle: 'M43 61 Q48 64 53 61',
  hover: 'M42 60 Q48 67 54 60',
  happy: 'M42 60 Q48 69 54 60 Q48 63 42 60Z',
  thinking: 'M46 62 Q49 61 52 62',
  sad: 'M43 64 Q48 59 53 64',
  sleepy: 'M45 63 L51 63',
}

export function resolveMascotExpression(state: MascotExpression, attentive: boolean, sleepy: boolean): MascotExpression {
  if (state !== 'idle') return state
  return attentive ? 'hover' : sleepy ? 'sleepy' : 'idle'
}

export function canTrackMascotPointer(expression: MascotExpression, reducedMotion: boolean, finePointer: boolean) {
  return !reducedMotion && finePointer && (expression === 'idle' || expression === 'hover')
}

/** SVG-space movement: at the largest rendered size this stays below 3px. */
export function getMascotGaze(dx: number, dy: number) {
  const distance = Math.hypot(dx, dy)
  if (distance > 160 || distance === 0) return { x: 0, y: 0 }
  const strength = Math.min(3.5, distance / 24)
  return { x: dx / distance * strength, y: dy / distance * strength }
}
