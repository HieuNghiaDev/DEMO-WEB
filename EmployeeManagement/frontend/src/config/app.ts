// Release metadata for THEMIS.
// Values can be overridden at build time via Vite environment variables.

export const appMetadata = {
  version: import.meta.env.VITE_APP_VERSION?.trim() || '0.11.0',
  codename: import.meta.env.VITE_APP_CODENAME?.trim() || 'KAI',
  environmentLabel: import.meta.env.VITE_APP_ENV_LABEL?.trim() || 'Preview',
  build: import.meta.env.VITE_APP_BUILD?.trim() || '2026.09.25',
} as const

export const appDisplayMetadata = {
  recommendedResolution: '1920 × 1080（Full HD）',
  recommendedScale: '100%',
  minimumResolution: '1366 × 768 以上を推奨',
} as const

export const lastSeenVersionStorageKey = 'themis:lastSeenVersion'
