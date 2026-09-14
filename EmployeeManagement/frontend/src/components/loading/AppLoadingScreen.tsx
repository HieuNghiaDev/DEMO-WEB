export function AppLoadingScreen() {
  return (
    <main className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--tm-page)] text-[var(--tm-text-primary)]">
      <div className="flex flex-col items-center animate-in fade-in duration-500 zoom-in-95">
        <div className="text-xl font-bold tracking-[0.25em] text-[var(--tm-primary)] mb-1">
          THEMIS
        </div>
        <div className="text-xs tracking-widest text-[var(--tm-text-secondary)] mb-8">
          業務管理システム
        </div>

        {/* Subtle ring/progress indicator */}
        <div className="relative flex items-center justify-center">
          <div className="h-10 w-10 rounded-full border-2 border-[var(--tm-surface-hover)]" />
          <div className="absolute h-10 w-10 rounded-full border-2 border-transparent border-t-[var(--tm-primary)] animate-spin motion-reduce:animate-none" />
        </div>
        <div className="mt-6 text-[10px] font-medium text-[var(--tm-text-tertiary)] tracking-wider">
          処理中...
        </div>
      </div>
    </main>
  )
}
