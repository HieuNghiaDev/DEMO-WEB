import { Cloud, FileStack, RefreshCw } from 'lucide-react'
import { ButtonSpinner } from '../../components/loading'
import { CasePageHeader } from '../case-management/CasePrimitives'
import type { VisaProgressSource } from './types'
import { formatDateTime } from './visaProgressUi'

type Props = {
  source: VisaProgressSource | null
  refreshing: boolean
  onRefresh: () => void
}

export default function VisaProgressHeader({ source, refreshing, onRefresh }: Props) {
  return (
    <section className="cm-clv-hero" aria-label="在留申請進捗管理">
      <CasePageHeader
        title="在留申請進捗管理"
        description="在留申請の進捗・期限・追加資料対応を一元管理します。"
        kicker={<><FileStack size={12} aria-hidden="true" />在留管理 / Immigration Operations</>}
        showIllustration={false}
        actions={
          <button
            type="button"
            className="dc-button"
            disabled={refreshing}
            onClick={onRefresh}
          >
            {refreshing ? <ButtonSpinner size={14} /> : <RefreshCw size={14} aria-hidden="true" />}
            {refreshing ? '更新中…' : '最新データを取得'}
          </button>
        }
      />

      {source && <SourceInformation source={source} />}
    </section>
  )
}

function SourceInformation({ source }: { source: VisaProgressSource }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 border-t border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-5 py-2.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-5">
      <div className="flex min-w-0 items-center gap-2">
        <Cloud size={14} className="shrink-0 text-[var(--tm-primary)]" aria-hidden="true" />
        <p className="min-w-0 truncate text-xs font-medium leading-5 text-[var(--tm-text-primary)]" title={source.name}>
          <span className="text-[var(--tm-text-muted)]">Google Drive</span>
          <span className="mx-1.5 text-[var(--tm-text-muted)]" aria-hidden="true">/</span>
          {source.name}
        </p>
      </div>

      <p className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] leading-5 text-[var(--tm-text-secondary)]">
        <span>
          ファイル更新{' '}
          <span className="font-medium tabular-nums text-[var(--tm-text-primary)]">
            {formatDateTime(source.modified_at)}
          </span>
        </span>
        <span className="text-[var(--tm-text-muted)]" aria-hidden="true">·</span>
        <span>
          最終同期{' '}
          <span className="font-medium tabular-nums text-[var(--tm-text-primary)]">
            {formatDateTime(source.synced_at)}
          </span>
        </span>
        {source.sheet_name && (
          <>
            <span className="text-[var(--tm-text-muted)]" aria-hidden="true">·</span>
            <span>
              シート{' '}
              <span className="font-medium text-[var(--tm-text-primary)]">{source.sheet_name}</span>
            </span>
          </>
        )}
      </p>
    </div>
  )
}
