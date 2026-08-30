// Release metadata for the current demo, overridable at build time.
export const appMetadata = {
  version: import.meta.env.VITE_APP_VERSION?.trim() || '1.0.0',
  environmentLabel: (import.meta.env.VITE_APP_ENV_LABEL ?? 'Demo').trim(),
}
