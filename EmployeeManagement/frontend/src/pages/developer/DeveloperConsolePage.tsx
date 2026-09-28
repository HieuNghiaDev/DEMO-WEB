import axios from 'axios'
import {
  AlertCircle,
  ArrowDown,
  Bug,
  CalendarDays,
  CheckCircle2,
  Code2,
  GitCommit,
  Plus,
  Rocket,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ElementType } from 'react'
import { Navigate } from 'react-router-dom'
import { useAppRelease } from '../../contexts/AppReleaseContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  createRelease,
  fetchReleaseHistory,
  formatReleaseName,
  releaseNoteCategories,
  type AppRelease,
  type ReleaseNoteCategory,
  type ReleaseNotes,
  type ReleaseType,
} from '../../features/releases/releaseApi'
import { Button, LoadingState, ModalShell, PageHeader } from '../../components/ui'

const releaseTypes: Array<{
  id: ReleaseType
  label: string
  description: string
  icon: ElementType
  tone: string
}> = [
  { id: 'patch', label: '不具合修正', description: '既存機能の修正・軽微な改善', icon: Bug, tone: 'text-sky-600 dark:text-sky-300' },
  { id: 'minor', label: '機能追加', description: '新機能・大きめのUI改善', icon: Sparkles, tone: 'text-indigo-600 dark:text-indigo-300' },
  { id: 'major', label: '大型アップデート', description: '大規模な変更・正式メジャー更新', icon: Rocket, tone: 'text-amber-600 dark:text-amber-300' },
]

const noteLabels: Record<ReleaseNoteCategory, string> = {
  ui: 'UI・操作性',
  new_features: '新機能',
  improvements: '改善',
  bug_fixes: '不具合修正',
}

const emptyNotes = (): ReleaseNotes => ({
  ui: [''],
  new_features: [''],
  improvements: [''],
  bug_fixes: [''],
})

const nextVersion = (version: string, type: ReleaseType) => {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number)
  if (type === 'patch') return `${major}.${minor}.${patch + 1}`
  if (type === 'minor') return `${major}.${minor + 1}.0`
  return `${major + 1}.0.0`
}

const formatDate = (value: string | null, includeTime = false) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

const errorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 409) return error.response.data?.message ?? '別のリリースと競合しました。最新情報を再取得してください。'
    if (error.response?.status === 403) return 'リリースを作成する権限がありません。'
    const validation = error.response?.data?.errors as Record<string, string[]> | undefined
    if (validation) return Object.values(validation).flat()[0] ?? '入力内容を確認してください。'
    return error.response?.data?.message ?? 'リリースの作成に失敗しました。'
  }
  return 'リリースの作成に失敗しました。'
}

function releaseTypeLabel(type: ReleaseType) {
  return releaseTypes.find(item => item.id === type)?.label ?? type
}

export default function DeveloperConsolePage() {
  const { user } = useAuth()
  const { currentRelease, isLoading: isCurrentLoading, error: currentError, refreshRelease } = useAppRelease()
  const canView = user?.permission_names.includes('developer.view') ?? false
  const canManage = user?.permission_names.includes('developer.release.manage') ?? false
  const [releaseType, setReleaseType] = useState<ReleaseType>('patch')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState<ReleaseNotes>(emptyNotes)
  const [history, setHistory] = useState<AppRelease[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyLastPage, setHistoryLastPage] = useState(1)
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)
  const previewVersion = nextVersion(currentRelease.version, releaseType)

  const cleanedNotes = useMemo(() => Object.fromEntries(
    releaseNoteCategories.map(category => [category, notes[category].map(item => item.trim()).filter(Boolean)])
  ) as ReleaseNotes, [notes])
  const noteCount = useMemo(() => Object.values(cleanedNotes).flat().length, [cleanedNotes])
  const developerCurrentRelease = history[0]?.version === currentRelease.version
    ? { ...currentRelease, ...history[0] }
    : currentRelease

  const loadHistory = useCallback(async (page: number) => {
    try {
      setIsHistoryLoading(true)
      const result = await fetchReleaseHistory(page)
      setHistory(result.data)
      setHistoryPage(result.current_page)
      setHistoryLastPage(result.last_page)
    } catch {
      setError('リリース履歴を取得できませんでした。')
    } finally {
      setIsHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!canView) return
    const timer = window.setTimeout(() => void loadHistory(1), 0)
    return () => window.clearTimeout(timer)
  }, [canView, loadHistory])

  useEffect(() => () => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
  }, [])

  if (!canView) return <Navigate to="/" replace />

  const updateNote = (category: ReleaseNoteCategory, index: number, value: string) => {
    setNotes(current => ({
      ...current,
      [category]: current[category].map((item, itemIndex) => itemIndex === index ? value : item),
    }))
  }

  const addNote = (category: ReleaseNoteCategory) => {
    setNotes(current => ({ ...current, [category]: [...current[category], ''] }))
  }

  const removeNote = (category: ReleaseNoteCategory, index: number) => {
    setNotes(current => {
      const remaining = current[category].filter((_, itemIndex) => itemIndex !== index)
      return { ...current, [category]: remaining.length > 0 ? remaining : [''] }
    })
  }

  const requestConfirmation = () => {
    setError(null)
    if (!title.trim()) {
      setError('リリースタイトルを入力してください。')
      return
    }
    if (noteCount === 0) {
      setError('変更内容を1件以上入力してください。')
      return
    }
    setIsConfirmOpen(true)
  }

  const submitRelease = async () => {
    if (isSubmitting) return
    try {
      setIsSubmitting(true)
      setError(null)
      const released = await createRelease({ release_type: releaseType, title: title.trim(), release_notes: cleanedNotes })
      setIsConfirmOpen(false)
      setTitle('')
      setNotes(emptyNotes())
      await Promise.all([refreshRelease(), loadHistory(1)])
      setSuccess(`v${released.version} をリリースしました。`)
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => setSuccess(null), 4000)
    } catch (submitError) {
      setIsConfirmOpen(false)
      setError(errorMessage(submitError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-full pb-12">
      <PageHeader
        breadcrumb="システム / 開発者"
        domainKicker="DEVELOPER"
        title="開発者コンソール"
        description="THEMIS のバージョン、ビルド、リリース情報を管理します。"
      />

      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        {(error || currentError) && (
          <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error ?? currentError}</span>
          </div>
        )}

        {success && (
          <div role="status" className="fixed right-4 top-20 z-40 flex max-w-[calc(100vw-32px)] items-center gap-3 rounded-xl border border-emerald-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-lg dark:border-emerald-500/30 dark:bg-[var(--tm-surface-elevated)] dark:text-slate-100 sm:w-[360px]">
            <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />
            <span className="min-w-0 flex-1">{success}</span>
            <button type="button" aria-label="閉じる" onClick={() => setSuccess(null)} className="rounded-md p-1 text-[var(--tm-text-muted)] hover:bg-[var(--tm-surface-hover)]"><X size={16} /></button>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <section className="rounded-2xl border border-[var(--tm-border)] bg-[var(--tm-surface)] shadow-xs">
            <header className="border-b border-[var(--tm-border)] px-5 py-4 sm:px-6">
              <h2 className="text-sm font-semibold text-[var(--tm-text-primary)]">現在のリリース</h2>
            </header>
            <div className="p-5 sm:p-6">
              {isCurrentLoading ? <LoadingState message="リリース情報を読み込み中…" /> : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <strong className="text-2xl font-bold tracking-tight text-[var(--tm-text-primary)]">{formatReleaseName(developerCurrentRelease)}</strong>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">● {developerCurrentRelease.environment}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--tm-text-secondary)]">{developerCurrentRelease.title}</p>
                  <dl className="mt-6 divide-y divide-[var(--tm-border)] border-y border-[var(--tm-border)] text-sm">
                    <div className="flex items-center gap-3 py-3"><CalendarDays size={16} className="text-[var(--tm-text-muted)]" /><dt className="w-24 text-[var(--tm-text-secondary)]">リリース日時</dt><dd className="font-medium text-[var(--tm-text-primary)]">{formatDate(developerCurrentRelease.released_at, true)}</dd></div>
                    <div className="flex items-center gap-3 py-3"><UserRound size={16} className="text-[var(--tm-text-muted)]" /><dt className="w-24 text-[var(--tm-text-secondary)]">担当</dt><dd className="font-medium text-[var(--tm-text-primary)]">{developerCurrentRelease.released_by?.name ?? '—'}</dd></div>
                    {developerCurrentRelease.build_sha && <div className="flex items-center gap-3 py-3"><GitCommit size={16} className="text-[var(--tm-text-muted)]" /><dt className="w-24 text-[var(--tm-text-secondary)]">Commit</dt><dd className="font-mono text-xs text-[var(--tm-text-primary)]">{developerCurrentRelease.build_sha}</dd></div>}
                  </dl>
                </>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--tm-border)] bg-[var(--tm-surface)] shadow-xs">
            <header className="border-b border-[var(--tm-border)] px-5 py-4 sm:px-6">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="text-sm font-semibold text-[var(--tm-text-primary)]">新しいリリース</h2><p className="mt-1 text-xs text-[var(--tm-text-secondary)]">バージョン番号はサーバーが自動計算します。</p></div>
                <span className="rounded-md bg-violet-50 px-2 py-1 text-[10px] font-bold tracking-wider text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">DEVELOPER</span>
              </div>
            </header>
            <div className="space-y-6 p-5 sm:p-6">
              {!canManage && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">リリース履歴は閲覧できますが、公開権限はありません。</p>}
              <fieldset disabled={!canManage || isSubmitting}>
                <legend className="mb-3 text-xs font-semibold text-[var(--tm-text-primary)]">更新種類</legend>
                <div className="grid gap-3 md:grid-cols-3">
                  {releaseTypes.map(({ id, label, description, icon: Icon, tone }) => (
                    <label key={id} className="cursor-pointer">
                      <input type="radio" name="release-type" value={id} checked={releaseType === id} onChange={() => setReleaseType(id)} className="peer sr-only" />
                      <span className="block h-full rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] p-3 transition peer-checked:border-[var(--tm-primary)] peer-checked:bg-[var(--tm-primary-muted)] peer-checked:ring-1 peer-checked:ring-[var(--tm-primary)]/20">
                        <span className="flex items-center gap-2"><Icon size={17} className={tone} /><strong className="text-xs text-[var(--tm-text-primary)]">{label}</strong></span>
                        <span className="mt-2 block text-[11px] leading-5 text-[var(--tm-text-secondary)]">{description}</span>
                        <span className="mt-2 block font-mono text-xs font-semibold text-[var(--tm-text-primary)]">v{nextVersion(currentRelease.version, id)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-4 py-3 text-center">
                <div><span className="block text-[10px] text-[var(--tm-text-muted)]">現在</span><strong className="font-mono text-sm text-[var(--tm-text-primary)]">v{currentRelease.version}</strong></div>
                <ArrowDown size={18} className="-rotate-90 text-[var(--tm-primary)] sm:rotate-0" />
                <div><span className="block text-[10px] text-[var(--tm-text-muted)]">次のバージョン</span><strong className="font-mono text-sm text-[var(--tm-primary)]">v{previewVersion}</strong></div>
              </div>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-[var(--tm-text-primary)]">リリースタイトル <span className="text-rose-500">*</span></span>
                <input value={title} onChange={event => setTitle(event.target.value)} disabled={!canManage || isSubmitting} maxLength={160} placeholder="例：AI社員・UI改善アップデート" className="h-10 w-full rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-3 text-sm text-[var(--tm-text-primary)] outline-none placeholder:text-[var(--tm-text-muted)] focus:border-[var(--tm-border-focus)] focus:ring-2 focus:ring-[var(--tm-focus-ring)]/20" />
              </label>
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-[var(--tm-border)] bg-[var(--tm-surface)] shadow-xs">
          <header className="border-b border-[var(--tm-border)] px-5 py-4 sm:px-6"><h2 className="text-sm font-semibold text-[var(--tm-text-primary)]">リリースノート</h2><p className="mt-1 text-xs text-[var(--tm-text-secondary)]">公開する変更内容をカテゴリ別に入力します。</p></header>
          <div className="grid gap-5 p-5 md:grid-cols-2 sm:p-6">
            {releaseNoteCategories.map(category => (
              <fieldset key={category} disabled={!canManage || isSubmitting} className="min-w-0">
                <legend className="mb-2 text-xs font-semibold text-[var(--tm-text-primary)]">{noteLabels[category]}</legend>
                <div className="space-y-2">
                  {notes[category].map((item, index) => (
                    <div className="flex gap-2" key={`${category}-${index}`}>
                      <input value={item} onChange={event => updateNote(category, index, event.target.value)} maxLength={300} placeholder="変更内容を入力" className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-3 text-xs text-[var(--tm-text-primary)] outline-none placeholder:text-[var(--tm-text-muted)] focus:border-[var(--tm-border-focus)] focus:ring-2 focus:ring-[var(--tm-focus-ring)]/20" />
                      <button type="button" onClick={() => removeNote(category, index)} aria-label="項目を削除" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--tm-border)] text-[var(--tm-text-muted)] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => addNote(category)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--tm-primary)] hover:underline"><Plus size={14} />項目を追加</button>
              </fieldset>
            ))}
          </div>

          <div className="border-t border-[var(--tm-border)] p-5 sm:p-6">
            <div className="rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] p-4 sm:p-5">
              <p className="text-[10px] font-bold tracking-wider text-[var(--tm-text-muted)]">リリース予定</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><span className="font-mono text-[var(--tm-text-secondary)]">v{currentRelease.version}</span><span>→</span><strong className="font-mono text-[var(--tm-primary)]">v{previewVersion}{currentRelease.codename ? ` — ${currentRelease.codename}` : ''}</strong><span className="rounded-full border border-[var(--tm-border)] px-2 py-0.5 text-[10px] text-[var(--tm-text-secondary)]">{releaseTypeLabel(releaseType)}</span></div>
              <h3 className="mt-3 text-sm font-semibold text-[var(--tm-text-primary)]">{title.trim() || 'リリースタイトル未入力'}</h3>
              {noteCount > 0 ? <ul className="mt-3 grid gap-1 text-xs text-[var(--tm-text-secondary)] sm:grid-cols-2">{Object.values(cleanedNotes).flat().map((item, index) => <li key={`${item}-${index}`}>・{item}</li>)}</ul> : <p className="mt-2 text-xs text-[var(--tm-text-muted)]">変更内容を入力してください。</p>}
            </div>
            <div className="mt-4 flex justify-end"><Button variant="primary" icon={<Rocket size={16} />} onClick={requestConfirmation} disabled={!canManage || isSubmitting || isCurrentLoading}>リリースする</Button></div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-[var(--tm-border)] bg-[var(--tm-surface)] shadow-xs">
          <header className="flex items-center justify-between border-b border-[var(--tm-border)] px-5 py-4 sm:px-6"><h2 className="text-sm font-semibold text-[var(--tm-text-primary)]">リリース履歴</h2><span className="text-xs text-[var(--tm-text-muted)]">新しい順</span></header>
          {isHistoryLoading ? <LoadingState message="履歴を読み込み中…" /> : (
            <div className="divide-y divide-[var(--tm-border)]">
              {history.map(release => (
                <article key={release.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[180px_minmax(0,1fr)_180px] sm:px-6">
                  <div><strong className="text-sm text-[var(--tm-text-primary)]">{formatReleaseName(release)}</strong><p className="mt-1 text-xs text-[var(--tm-text-muted)]">{formatDate(release.released_at)}</p></div>
                  <div><div className="flex items-center gap-2"><span className="rounded-full border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-2 py-0.5 text-[10px] font-semibold text-[var(--tm-text-secondary)]">{releaseTypeLabel(release.release_type)}</span><h3 className="truncate text-sm font-medium text-[var(--tm-text-primary)]">{release.title}</h3></div><p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--tm-text-secondary)]">{Object.values(release.release_notes).flat().join('・')}</p></div>
                  <div className="text-xs text-[var(--tm-text-secondary)] sm:text-right"><span className="block text-[10px] text-[var(--tm-text-muted)]">Released by</span><strong className="mt-1 block font-medium text-[var(--tm-text-primary)]">{release.released_by?.name ?? '—'}</strong></div>
                </article>
              ))}
              {history.length === 0 && <p className="px-5 py-10 text-center text-sm text-[var(--tm-text-muted)]">リリース履歴はありません。</p>}
            </div>
          )}
          {historyLastPage > 1 && <footer className="flex items-center justify-end gap-3 border-t border-[var(--tm-border)] px-5 py-3"><Button size="sm" variant="outline" disabled={historyPage <= 1 || isHistoryLoading} onClick={() => void loadHistory(historyPage - 1)}>前へ</Button><span className="text-xs text-[var(--tm-text-secondary)]">{historyPage} / {historyLastPage}</span><Button size="sm" variant="outline" disabled={historyPage >= historyLastPage || isHistoryLoading} onClick={() => void loadHistory(historyPage + 1)}>次へ</Button></footer>}
        </section>
      </div>

      <ModalShell
        isOpen={isConfirmOpen}
        onClose={() => { if (!isSubmitting) setIsConfirmOpen(false) }}
        size="sm"
        title="新しいバージョンを公開しますか？"
        description="このリリース情報はすべての社員に表示されます。"
        icon={<Code2 size={18} />}
        footer={<><Button variant="outline" disabled={isSubmitting} onClick={() => setIsConfirmOpen(false)}>キャンセル</Button><Button variant="primary" loading={isSubmitting} onClick={() => void submitRelease()}>v{previewVersion} をリリース</Button></>}
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] p-4 text-center">
          <div><span className="block text-[10px] text-[var(--tm-text-muted)]">Current</span><strong className="font-mono text-sm">v{currentRelease.version}</strong></div><span>→</span><div><span className="block text-[10px] text-[var(--tm-text-muted)]">New</span><strong className="font-mono text-sm text-[var(--tm-primary)]">v{previewVersion}</strong></div>
        </div>
        <p className="mt-4 text-sm font-semibold text-[var(--tm-text-primary)]">{title.trim()}</p>
        <p className="mt-1 text-xs text-[var(--tm-text-secondary)]">{releaseTypeLabel(releaseType)} · {noteCount}件の変更</p>
      </ModalShell>
    </div>
  )
}
