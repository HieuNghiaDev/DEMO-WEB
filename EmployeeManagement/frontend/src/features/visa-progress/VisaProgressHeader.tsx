import { Cloud, FileStack, RefreshCw } from 'lucide-react'
import type { VisaProgressSource } from './types'
import { formatDateTime } from './visaProgressUi'

type Props = {
  source: VisaProgressSource | null
  refreshing: boolean
  onRefresh: () => void
}

export default function VisaProgressHeader({ source, refreshing, onRefresh }: Props) {
  return (
    <header className="px-4 pb-4 pt-5 sm:px-5 lg:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            <FileStack size={14} aria-hidden="true" />
            <span>在留管理 / Immigration</span>
          </div>
          <div className="border-l-2 border-indigo-500 pl-4">
            <h1 className="text-2xl font-semibold leading-tight tracking-tight text-slate-950 dark:text-slate-100 md:text-[28px]">
              在留申請進捗管理
            </h1>
            <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
              在留申請の進捗・期限・追加資料対応を一元管理
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={refreshing}
          onClick={onRefresh}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 transition-colors duration-150 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-200 dark:focus-visible:ring-offset-slate-950"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : 'text-indigo-500 dark:text-indigo-300'} aria-hidden="true" />
          {refreshing ? '更新中…' : '最新データを取得'}
        </button>
      </div>

      {source && <SourceInformation source={source} />}
    </header>
  )
}

function SourceInformation({ source }: { source: VisaProgressSource }) {
  return (
    <div className="mt-4 flex min-w-0 flex-col gap-2.5 border-t border-slate-100 pt-3.5 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between lg:gap-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Cloud size={15} className="shrink-0 text-indigo-500 dark:text-indigo-300" aria-hidden="true" />
        <p className="min-w-0 break-words text-[13px] font-medium leading-5 text-slate-700 dark:text-slate-200" title={source.name}>
          <span className="text-slate-500 dark:text-slate-400">Google Drive</span>
          <span className="mx-2 text-slate-300 dark:text-slate-600" aria-hidden="true">/</span>
          {source.name}
        </p>
      </div>

      <p className="flex shrink-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
        <span>ファイル更新 <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{formatDateTime(source.modified_at)}</span></span>
        <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
        <span>最終同期 <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{formatDateTime(source.synced_at)}</span></span>
        {source.sheet_name && (
          <>
            <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
            <span>シート <span className="font-medium text-slate-700 dark:text-slate-200">{source.sheet_name}</span></span>
          </>
        )}
      </p>
    </div>
  )
}
