import type { ThemisActivity, ThemisExpression, ThemisGazeDirection } from './mascotExpressions'

type EyeShape = 'open' | 'wide' | 'narrow' | 'half' | 'curve' | 'wink' | 'concerned'
type MouthShape = 'none' | 'softSmile' | 'smile' | 'small' | 'open' | 'talking'
type BrowShape = 'none' | 'focused' | 'concerned' | 'proud'
type FaceEffect = 'none' | 'greeting' | 'sparkles' | 'question' | 'idea' | 'heart' | 'dots' | 'exclamation'

type FaceConfig = { leftEye: EyeShape; rightEye?: EyeShape; gaze?: ThemisGazeDirection; mouth?: MouthShape; brows?: BrowShape; effect?: FaceEffect; blinkAllowed?: boolean }
type ThemisFaceProps = { expression: ThemisExpression; activity: ThemisActivity; gaze?: ThemisGazeDirection; blinking?: boolean }

const EXPRESSION_CONFIG: Record<ThemisExpression, FaceConfig> = {
  idle: { leftEye: 'open', mouth: 'softSmile' }, neutral: { leftEye: 'open', mouth: 'softSmile' }, softSmile: { leftEye: 'open', mouth: 'softSmile' },
  greeting: { leftEye: 'open', mouth: 'smile' },
  happy: { leftEye: 'curve', mouth: 'smile', blinkAllowed: false },
  excited: { leftEye: 'wide', mouth: 'smile', blinkAllowed: false },
  wink: { leftEye: 'open', rightEye: 'wink', mouth: 'softSmile', blinkAllowed: false },
  curious: { leftEye: 'open', rightEye: 'wide', gaze: 'right', mouth: 'small', effect: 'question' },
  thinking: { leftEye: 'open', gaze: 'up', mouth: 'small', effect: 'dots' },
  focused: { leftEye: 'narrow', brows: 'focused', mouth: 'small' },
  surprised: { leftEye: 'wide', mouth: 'open', effect: 'exclamation', blinkAllowed: false },
  confused: { leftEye: 'half', rightEye: 'open', gaze: 'left', mouth: 'small', effect: 'question' },
  concerned: { leftEye: 'concerned', mouth: 'small', brows: 'concerned' },
  supportive: { leftEye: 'open', mouth: 'softSmile' },
  proud: { leftEye: 'narrow', mouth: 'smile', brows: 'proud' },
  thankful: { leftEye: 'curve', mouth: 'smile', effect: 'heart', blinkAllowed: false },
  sleepy: { leftEye: 'half', mouth: 'small', blinkAllowed: false },
  listening: { leftEye: 'open', gaze: 'right', mouth: 'softSmile' },
  talking: { leftEye: 'open', mouth: 'talking', blinkAllowed: false },
  idea: { leftEye: 'open', gaze: 'up', mouth: 'softSmile', effect: 'idea' },
}

const ACTIVITY_EXPRESSION: Partial<Record<ThemisActivity, ThemisExpression>> = { processing: 'focused', searching: 'focused', generating: 'focused', success: 'happy', error: 'concerned' }
const GAZE_OFFSETS: Record<ThemisGazeDirection, { x: number; y: number }> = { center: { x: 0, y: 0 }, left: { x: -2.2, y: 0 }, right: { x: 2.2, y: 0 }, up: { x: 1.1, y: -2 }, down: { x: 0, y: 1.5 } }

function Eye({ side, shape, gaze }: { side: 'left' | 'right'; shape: EyeShape; gaze: ThemisGazeDirection }) {
  const cx = side === 'left' ? 26 : 76
  const { x, y } = GAZE_OFFSETS[gaze]
  if (shape === 'curve' || shape === 'wink') return <path className="themis-face-eye-line" d={`M${cx - 10} 34Q${cx} 22 ${cx + 10} 34`} />
  if (shape === 'concerned') return <path className={`themis-face-eye-line themis-face-eye-line--concerned themis-face-eye-line--${side}`} d={`M${cx - 10} 32Q${cx} 25 ${cx + 10} 32`} />
  const radiusY = shape === 'wide' ? 9.3 : shape === 'narrow' ? 5.6 : shape === 'half' ? 4.2 : 8
  const irisY = Math.max(radiusY - 2.1, 2.8)
  return <g className={`themis-face-eye themis-face-eye--${shape}`}><ellipse className="themis-face-eye-glow" cx={cx} cy="32" rx="8.8" ry={radiusY} /><ellipse className="themis-face-pupil" cx={cx + x} cy={32 + y} rx={shape === 'wide' ? 5.1 : 4.8} ry={irisY} /><circle className="themis-face-eye-highlight" cx={cx + x - 1.7} cy={29.6 + y} r="1.05" /><circle className="themis-face-eye-highlight themis-face-eye-highlight--soft" cx={cx + x + 1.5} cy={34.5 + y} r=".48" /></g>
}

function Mouth({ shape }: { shape: MouthShape }) {
  if (shape === 'none') return null
  if (shape === 'open') return <ellipse className="themis-face-mouth themis-face-mouth--open" cx="50" cy="48" rx="2.8" ry="3.5" />
  if (shape === 'small') return <path className="themis-face-mouth" d="M47.2 48.2Q50 49.3 52.8 48.2" />
  const smilePath = shape === 'softSmile' ? 'M46.2 47.7Q50 50.2 53.8 47.7' : 'M44.7 47.2Q50 51.2 55.3 47.2'
  return <path className={`themis-face-mouth themis-face-mouth--${shape}`} d={smilePath} />
}

function Brows({ shape }: { shape: BrowShape }) {
  if (shape === 'none') return null
  if (shape === 'focused') return <g className="themis-face-brows"><path d="M17 19L32 22" /><path d="M68 22L83 19" /></g>
  if (shape === 'concerned') return <g className="themis-face-brows"><path d="M17 22L31 18" /><path d="M69 18L83 22" /></g>
  return <g className="themis-face-brows"><path d="M17 19L32 18" /><path d="M68 18L83 19" /></g>
}

export default function ThemisFace({ expression, activity, gaze, blinking = false }: ThemisFaceProps) {
  const resolvedExpression = ACTIVITY_EXPRESSION[activity] ?? expression
  const config = EXPRESSION_CONFIG[resolvedExpression]
  const resolvedGaze = gaze ?? config.gaze ?? 'center'
  const showBlink = blinking && config.blinkAllowed !== false
  return <svg className="themis-face-layer" data-activity={activity} data-blinking={showBlink || undefined} data-effect={config.effect ?? 'none'} data-expression={resolvedExpression} data-gaze={resolvedGaze} viewBox="0 0 100 100" fill="none" aria-hidden="true"><g className="themis-face-stage" transform="translate(15 26) scale(.7 .9)"><g className="themis-face-eye-group"><Brows shape={config.brows ?? 'none'} /><Eye gaze={resolvedGaze} shape={config.leftEye} side="left" /><Eye gaze={resolvedGaze} shape={config.rightEye ?? config.leftEye} side="right" /></g><g className="themis-face-blink"><path d="M14 32Q25 36 36 32M64 32Q75 36 86 32" /></g><Mouth shape={config.mouth ?? 'none'} /><g className="themis-face-blush"><ellipse cx="15" cy="42" rx="4" ry="1.8" /><ellipse cx="85" cy="42" rx="4" ry="1.8" /></g><g className="themis-face-processing"><circle cx="42" cy="48" r="2" /><circle cx="50" cy="48" r="2" /><circle cx="58" cy="48" r="2" /></g><path className="themis-face-scan" d="M12 20H88" /><g className="themis-face-search-mark"><path d="M10 17V10H17M83 10H90V17M10 43V50H17M83 50V43" /></g><g className="themis-face-document"><rect x="72" y="35" width="14" height="17" rx="2" /><path d="M76 40H82M76 44H82M76 48H80" /></g><g className="themis-face-success"><path d="M74 42L79 47L88 36" /></g><g className="themis-face-error"><path d="M82 34V43M82 48V49" /></g><g className="themis-face-question"><path d="M79 10C80 5 89 5 89 11C89 16 84 15 84 20M84 25V26" /></g><g className="themis-face-idea"><path d="M81 3C88 3 91 8 89 13C88 16 85 17 85 20H78C78 17 74 15 74 11C74 6 77 3 81 3ZM78 24H85" /></g><g className="themis-face-sparkles"><path d="M10 14V22M6 18H14M90 12V20M86 16H94" /></g><g className="themis-face-heart"><path d="M84 8C80 3 72 8 84 18C96 8 88 3 84 8Z" /></g><g className="themis-face-greeting"><path d="M7 12L2 7M11 8V2M93 12L98 7" /></g><g className="themis-face-exclamation"><path d="M84 7V17M84 22V23" /></g></g></svg>
}
