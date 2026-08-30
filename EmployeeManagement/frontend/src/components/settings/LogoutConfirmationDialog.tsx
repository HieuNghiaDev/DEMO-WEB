import { useEffect, useRef } from 'react'
import { LoaderCircle, LogOut } from 'lucide-react'

// The sidebar's existing confirmation is now owned by System Settings.
export default function LogoutConfirmationDialog({ isLoggingOut, onCancel, onConfirm }: {
  isLoggingOut: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    dialog?.showModal()
    return () => {
      dialog?.close()
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])

  return (
    <dialog ref={dialogRef} aria-labelledby="logout-confirmation-title" aria-describedby="logout-confirmation-description"
      onCancel={(event) => { event.preventDefault(); if (!isLoggingOut) onCancel() }}
      onClick={(event) => { if (event.target === event.currentTarget && !isLoggingOut) onCancel() }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/55 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <div className="p-6" onClick={(event) => event.stopPropagation()}>
        <LogOut size={22} className="text-rose-600 dark:text-rose-300" aria-hidden="true" />
        <h2 id="logout-confirmation-title" className="mt-4 text-lg font-semibold">ログアウトしますか？</h2>
        <p id="logout-confirmation-description" className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          現在のセッションを終了します。<br />再度利用するにはログインが必要です。
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3" aria-busy={isLoggingOut}>
          <button type="button" disabled={isLoggingOut} onClick={onCancel}
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">キャンセル</button>
          <button type="button" disabled={isLoggingOut} onClick={onConfirm}
            className="flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-60">
            {isLoggingOut && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
            {isLoggingOut ? '処理中...' : 'ログアウト'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
