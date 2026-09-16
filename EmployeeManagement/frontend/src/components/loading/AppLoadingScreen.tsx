import { ThemisLoadingMark } from './ThemisLoadingMark'

export interface AppLoadingScreenProps {
  label?: string
}

export function AppLoadingScreen({ label = 'ワークスペースを準備しています' }: AppLoadingScreenProps) {
  return (
    <main
      className="themis-app-loader fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[var(--tm-bg)] px-6 text-[var(--tm-text-primary)]"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="themis-app-loader__ambient" aria-hidden="true" />
      <div className="themis-app-loader__content">
        <ThemisLoadingMark size="lg" />
        <div className="mt-7 text-center">
          <div className="text-[1.05rem] font-bold tracking-[0.28em] text-[var(--tm-text-primary)]">THEMIS</div>
          <p className="mt-2 text-[11px] font-medium tracking-[0.18em] text-[var(--tm-text-muted)]">INTELLIGENT LEGAL WORKSPACE</p>
        </div>
        <div className="themis-app-loader__track mt-8" aria-hidden="true">
          <span />
        </div>
        <p className="mt-4 text-xs font-medium text-[var(--tm-text-secondary)]">{label}</p>
      </div>
    </main>
  )
}
