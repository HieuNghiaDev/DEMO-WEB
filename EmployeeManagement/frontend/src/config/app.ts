import versionInfo from '../../version.json'

// Release metadata for THEMIS.
// To bump the application version, update EmployeeManagement/frontend/version.json.
const configuredVersion = versionInfo.version.trim() || '1.0.0'
const configuredReleasedAt = versionInfo.releasedAt?.trim() || ''

export const appMetadata = {
  version: import.meta.env.VITE_APP_VERSION?.trim() || configuredVersion,
  codename: import.meta.env.VITE_APP_CODENAME?.trim() || '',
  environmentLabel: import.meta.env.VITE_APP_ENV_LABEL?.trim() || 'Production',
  build: import.meta.env.VITE_APP_BUILD?.trim() || configuredReleasedAt,
} as const

export const appDisplayMetadata = {
  recommendedResolution: '1920 × 1080（Full HD）',
  recommendedScale: '100%',
  minimumResolution: '1366 × 768 以上を推奨',
} as const

export const lastSeenVersionStorageKey = 'themis:lastSeenVersion'
