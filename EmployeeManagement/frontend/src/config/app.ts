// Release metadata for THEMIS.
// Values can be overridden at build time via Vite environment variables.

export const appMetadata = {
  version: import.meta.env.VITE_APP_VERSION?.trim() || '0.10.0',

  codename: import.meta.env.VITE_APP_CODENAME?.trim() || 'KAI',

  environmentLabel:
    import.meta.env.VITE_APP_ENV_LABEL?.trim() || 'Preview',

  build:
    import.meta.env.VITE_APP_BUILD?.trim() || '2026.09.04',
} as const

export const appReleaseName =
  `v${appMetadata.version} — ${appMetadata.codename}`

export const appBuildLabel =
  `${appMetadata.environmentLabel} Build · ${appMetadata.build}`
