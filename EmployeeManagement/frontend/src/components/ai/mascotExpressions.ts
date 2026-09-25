/**
 * `idle` and `idea` are retained as legacy aliases for existing callers.
 * New UI should prefer `neutral` for the attentive, open-eyed resting face.
 */
export type ThemisExpression =
  | 'idle'
  | 'neutral'
  | 'softSmile'
  | 'greeting'
  | 'happy'
  | 'excited'
  | 'wink'
  | 'curious'
  | 'thinking'
  | 'focused'
  | 'surprised'
  | 'confused'
  | 'concerned'
  | 'supportive'
  | 'proud'
  | 'thankful'
  | 'sleepy'
  | 'listening'
  | 'talking'
  | 'idea'

export type ThemisGazeDirection = 'center' | 'left' | 'right' | 'up' | 'down'
export type ThemisActivity = 'none' | 'processing' | 'searching' | 'generating' | 'success' | 'error'

/** Compatibility alias for existing mascot consumers. */
export type ThemisAction = ThemisActivity
export type MascotVisualState = ThemisExpression | Exclude<ThemisActivity, 'none'>

export const THEMIS_HEAD_ASSET = '/images/themis-mascot/themis-head-shell.png'
export const MASCOT_FEEDBACK_DURATION = { success: 1_500, error: 2_400 } as const

export const THEMIS_EXPRESSION_PREVIEW_STATES: ThemisExpression[] = [
  'neutral', 'softSmile', 'greeting', 'happy', 'excited', 'wink',
  'curious', 'thinking', 'focused', 'surprised', 'confused', 'concerned',
  'supportive', 'proud', 'thankful', 'sleepy', 'listening', 'talking',
]

export function resolveMascotVisualState(activity: ThemisActivity = 'none', expression: ThemisExpression = 'idle'): MascotVisualState {
  if (activity === 'error') return 'error'
  if (activity === 'success') return 'success'
  if (activity === 'generating') return 'generating'
  if (activity === 'searching') return 'searching'
  if (activity === 'processing') return 'processing'
  return expression
}
