import { Cloud, FileStack, RefreshCw } from 'lucide-react'
import type { VisaProgressSource } from './types'
import { formatDateTime } from './visaProgressUi'
import { Button } from '../../components/ui'

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
          <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--tm-primary)]">
            <FileStack size={14} aria-hidden="true" />
            <span>在留管理 / Immigration Operations</span>
          </div>
          <div className="border-l-2 border-[var(--tm-primary)] pl-4">
            <h1 className="text-2xl font-semibold leading-tight tracking-tight text-[var(--tm-text-primary)] md:text-[28px]">
              在留申請進捗管理
            </h1>
            <p className="mt-1 text-sm leading-5 text-[var(--tm-text-secondary)]">
              在留申請の進捗・期限・追加資料対応を一元管理
            </p>
          </div>
        </div>

        <Button
          variant="secondary"
          size="md"
          disabled={refreshing}
          loading={refreshing}
          onClick={onRefresh}
          icon={!refreshing ? <RefreshCw size={14} className="text-[var(--tm-primary)]" /> : undefined}
        >
          {refreshing ? '更新中…' : '最新データを取得'}
        </Button>
      </div>

      {source && <SourceInformation source={source} />}
    </header>
  )
}

function SourceInformation({ source }: { source: VisaProgressSource }) {
  return (
    <div className="mt-4 flex min-w-0 flex-col gap-2.5 border-t border-[var(--tm-border)] pt-3.5 lg:flex-row lg:items-center lg:justify-between lg:gap-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Cloud size={15} className="shrink-0 text-[var(--tm-primary)]" aria-hidden="true" />
        <p className="min-w-0 break-words text-[13px] font-medium leading-5 text-[var(--tm-text-primary)]" title={source.name}>
          <span className="text-[var(--tm-text-muted)]">Google Drive</span>
          <span className="mx-2 text-[var(--tm-text-dim)]" aria-hidden="true">/</span>
          {source.name}
        </p>
      </div>

      <p className="flex shrink-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-5 text-[var(--tm-text-secondary)]">
        <span>ファイル更新 <span className="font-medium tabular-nums text-[var(--tm-text-primary)]">{formatDateTime(source.modified_at)}</span></span>
        <span className="text-[var(--tm-text-dim)]" aria-hidden="true">·</span>
        <span>最終同期 <span className="font-medium tabular-nums text-[var(--tm-text-primary)]">{formatDateTime(source.synced_at)}</span></span>
        {source.sheet_name && (
          <>
            <span className="text-[var(--tm-text-dim)]" aria-hidden="true">·</span>
            <span>シート <span className="font-medium text-[var(--tm-text-primary)]">{source.sheet_name}</span></span>
          </>
        )}
      </p>
    </div>
  )
}
