import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Plus,
  Pencil,
  RefreshCw,
  Search,
  Scale,
  Trash2,
} from 'lucide-react'
import api from '../services/api'

type CaseStatus =
  | 'received'
  | 'reviewing'
  | 'in_progress'
  | 'waiting'
  | 'waiting_payment'
  | 'completed'

type BusinessCase = {
  id: number
  code: string
  customerName: string
  customerKana: string
  caseType: string
  assignee: string
  role: string
  status: CaseStatus
  memo: string
  documentsDone: number
  documentsTotal: number
  updatedAt: string
}

type ApiCaseFile = {
  id: number
  title: string
  case_type: string | null
  status: 'intake' | 'active' | 'waiting_documents' | 'reviewing' | 'waiting_payment' | 'on_hold' | 'closed'
  updated_at: string
  documents_count: number
  confirmed_documents_count: number
  client: { name: string; name_kana: string | null }
  assigned_employee: { full_name: string; position_title: string | null } | null
}

type CaseDetail = ApiCaseFile & {
  documents: { id: number; title: string; category: string; version: string; status: string; file_url: string | null }[]
  precedents: { id: number; title: string; citation: string | null; summary: string | null; relevance: string | null }[]
  meeting_logs: { id: number; meeting_date: string; attendees: string | null; content: string; next_action: string | null; status: string }[]
}

const statusMap: Record<ApiCaseFile['status'], CaseStatus> = {
  intake: 'received',
  active: 'in_progress',
  waiting_documents: 'waiting',
  reviewing: 'reviewing',
  waiting_payment: 'waiting_payment',
  on_hold: 'waiting',
  closed: 'completed',
}

const mapCaseFile = (caseFile: ApiCaseFile): BusinessCase => {
  const total = caseFile.documents_count ?? 0
  const confirmed = caseFile.confirmed_documents_count ?? 0
  const updated = new Date(caseFile.updated_at)
  const memo = total === 0 ? '資料を登録してください' : confirmed === total ? '資料確認済み' : `確認待ちの資料 ${total - confirmed}件`

  return {
    id: caseFile.id,
    code: `CASE-${updated.getFullYear()}-${String(caseFile.id).padStart(3, '0')}`,
    customerName: caseFile.client.name,
    customerKana: caseFile.client.name_kana ?? '',
    caseType: caseFile.case_type ?? '未分類',
    assignee: caseFile.assigned_employee?.full_name ?? '未割当',
    role: caseFile.assigned_employee?.position_title ?? '担当者',
    status: statusMap[caseFile.status],
    memo,
    documentsDone: confirmed,
    documentsTotal: total,
    updatedAt: new Intl.DateTimeFormat('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(updated),
  }
}

const statusConfig: Record<
  CaseStatus,
  {
    label: string
    dot: string
    badge: string
  }
> = {
  received: {
    label: '受付済み',
    dot: 'bg-cyan-500 dark:bg-cyan-400',
    badge: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-300',
  },

  reviewing: {
    label: '確認中',
    dot: 'bg-amber-500 dark:bg-amber-400',
    badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300',
  },

  in_progress: {
    label: '対応中',
    dot: 'bg-sky-500 dark:bg-sky-400',
    badge: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-300',
  },

  waiting: {
    label: '書類待ち',
    dot: 'bg-orange-500 dark:bg-orange-400',
    badge: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/25 dark:bg-orange-400/10 dark:text-orange-300',
  },

  waiting_payment: {
    label: '支払待ち',
    dot: 'bg-violet-500 dark:bg-violet-400',
    badge: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300',
  },

  completed: {
    label: '完了',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300',
  },
}

function BusinessQuest() {
  const [cases, setCases] = useState<BusinessCase[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] =
    useState<'all' | CaseStatus>('all')
  const [caseType, setCaseType] = useState('all')
  const [selectedCase, setSelectedCase] = useState<CaseDetail | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isCreatingCase, setIsCreatingCase] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newCase, setNewCase] = useState({
    customerName: '',
    customerKana: '',
    clientType: 'individual',
    title: '',
    caseType: '',
    status: 'intake',
  })

  const loadCases = async () => {
    setIsLoading(true)
    setLoadError(null)

    try {
      const response = await api.get<{ case_files: ApiCaseFile[] }>('/case-files')
      setCases(response.data.case_files.map(mapCaseFile))
    } catch {
      setLoadError('案件データを読み込めませんでした。')
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch the current database-backed case list once when this screen opens.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadCases() }, [])

  const caseTypes = useMemo(
    () => Array.from(new Set(cases.map((item) => item.caseType))),
    [cases],
  )

  const filteredCases = useMemo(() => {
    const search = keyword.trim().toLowerCase()

    return cases.filter((item) => {
      const matchesKeyword =
        !search ||
        item.customerName.toLowerCase().includes(search) ||
        item.customerKana.toLowerCase().includes(search) ||
        item.code.toLowerCase().includes(search) ||
        item.caseType.toLowerCase().includes(search) ||
        item.assignee.toLowerCase().includes(search)

      const matchesStatus =
        status === 'all' || item.status === status

      const matchesCaseType =
        caseType === 'all' || item.caseType === caseType

      return (
        matchesKeyword &&
        matchesStatus &&
        matchesCaseType
      )
    })
  }, [cases, keyword, status, caseType])

  const handleOpenCase = async (id: number) => {
    try {
      const response = await api.get<{ case_file: CaseDetail }>(`/case-files/${id}`)
      setSelectedCase(response.data.case_file)
    } catch {
      setLoadError('案件詳細を読み込めませんでした。')
    }
  }

  const handleCreateCase = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsCreatingCase(true)
    setCreateError(null)

    try {
      const clientResponse = await api.post<{ client: { id: number } }>('/clients', {
        name: newCase.customerName,
        name_kana: newCase.customerKana || null,
        client_type: newCase.clientType,
      })
      const caseResponse = await api.post<{ case_file: ApiCaseFile }>('/case-files', {
        client_id: clientResponse.data.client.id,
        title: newCase.title,
        case_type: newCase.caseType || null,
        status: newCase.status,
      })

      setCases((current) => [mapCaseFile(caseResponse.data.case_file), ...current])
      setNewCase({ customerName: '', customerKana: '', clientType: 'individual', title: '', caseType: '', status: 'intake' })
      setIsCreateDialogOpen(false)
      await handleOpenCase(caseResponse.data.case_file.id)
    } catch {
      setCreateError('案件を登録できませんでした。入力内容を確認してください。')
    } finally {
      setIsCreatingCase(false)
    }
  }

  if (selectedCase) {
    return <CaseDetailPage caseFile={selectedCase} onBack={() => { setSelectedCase(null); void loadCases() }} />
  }

  return (
    /*
      QUAN TRỌNG:
      - Không dùng w-screen
      - Không dùng 100vw
      - min-w-0 giúp content không đẩy/chèn sidebar
      - px tạo khoảng cách giống OrganizationDesign
    */
    <div
      className="w-full min-w-0 max-w-full overflow-x-hidden px-3 pb-8 pt-3 sm:px-4 sm:pt-4 lg:px-6 lg:pt-5"
    >
      {/* ================================================= */}
      {/* HEADER */}
      {/* ================================================= */}

      <section
        className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/80 dark:bg-[#111a2e] dark:shadow-none sm:mb-5"
      >
        <div
          className="flex flex-col gap-5 px-4 py-5 sm:px-5 lg:flex-row lg:items-center lg:justify-between lg:px-7 lg:py-6"
        >
          {/* LEFT */}

          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <Scale
                size={14}
                className="shrink-0 text-indigo-600 dark:text-indigo-400"
              />

              <span
                className="truncate text-[10px] font-bold tracking-[0.14em] text-indigo-600 dark:text-indigo-400 sm:text-[11px]"
              >
                THEMIS CASE MANAGEMENT
              </span>
            </div>

            <h1
              className="text-[22px] font-bold tracking-tight text-slate-900 dark:text-white sm:text-[25px]"
            >
              業務クエスト
            </h1>

            <p
              className="mt-1 text-[12px] text-slate-500 dark:text-slate-400 sm:text-[13px]"
            >
              顧客案件・必要書類・対応状況を一元管理
            </p>
          </div>

          {/* ACTION */}

          <div
            className="flex w-full items-center gap-2 sm:w-auto"
          >
            <button
              type="button"
              onClick={() => void loadCases()}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800 sm:flex-none sm:px-4"
            >
              <RefreshCw size={14} />

              <span>更新</span>
            </button>

            <button
              type="button"
              onClick={() => { setCreateError(null); setIsCreateDialogOpen(true) }}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-[12px] font-bold text-white shadow-sm transition hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 sm:flex-none"
            >
              <Plus size={16} />

              新規案件
            </button>
          </div>
        </div>
      </section>

      {isCreateDialogOpen && (
        <Dialog title="新規案件を登録" onClose={() => setIsCreateDialogOpen(false)}>
          <form onSubmit={handleCreateCase} className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">顧客と案件の基本情報を登録します。登録後は資料・打合せ記録を追加できます。</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="顧客名 *"><input required value={newCase.customerName} onChange={(event) => setNewCase({ ...newCase, customerName: event.target.value })} className={inputClass} placeholder="例：NGUYEN VAN A" /></FormField>
              <FormField label="フリガナ"><input value={newCase.customerKana} onChange={(event) => setNewCase({ ...newCase, customerKana: event.target.value })} className={inputClass} placeholder="例：グエン・ヴァン・ア" /></FormField>
              <FormField label="顧客区分"><select value={newCase.clientType} onChange={(event) => setNewCase({ ...newCase, clientType: event.target.value })} className={inputClass}><option value="individual">個人</option><option value="corporate">法人</option></select></FormField>
              <FormField label="案件ステータス"><select value={newCase.status} onChange={(event) => setNewCase({ ...newCase, status: event.target.value })} className={inputClass}><option value="intake">受付</option><option value="active">対応中</option><option value="waiting_documents">書類待ち</option><option value="reviewing">確認中</option><option value="waiting_payment">支払待ち</option><option value="on_hold">保留</option><option value="closed">完了</option></select></FormField>
            </div>
            <FormField label="案件名・依頼内容 *"><input required value={newCase.title} onChange={(event) => setNewCase({ ...newCase, title: event.target.value })} className={inputClass} placeholder="例：在留期間更新許可申請" /></FormField>
            <FormField label="案件種別"><input value={newCase.caseType} onChange={(event) => setNewCase({ ...newCase, caseType: event.target.value })} className={inputClass} placeholder="例：在留期間更新、労災事故、契約レビュー" /></FormField>
            {createError && <p className="text-sm font-medium text-rose-600">{createError}</p>}
            <DialogActions onClose={() => setIsCreateDialogOpen(false)} submitting={isCreatingCase} submitLabel="案件を登録" />
          </form>
        </Dialog>
      )}

      {/* ================================================= */}
      {/* FILTER */}
      {/* ================================================= */}

      <section
        className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700/80 dark:bg-[#111a2e] dark:shadow-none"
      >
        <div
          className="flex flex-col gap-2.5 lg:flex-row"
        >
          {/* SEARCH */}

          <div className="relative min-w-0 flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            />

            <input
              type="text"
              value={keyword}
              onChange={(event) =>
                setKeyword(event.target.value)
              }
              placeholder="顧客名・案件番号・担当者を検索"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 text-[12px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-[#0c1527] dark:text-slate-200 dark:placeholder:text-slate-600 dark:focus:border-indigo-500/60 dark:focus:bg-[#0c1527]"
            />
          </div>

          <SelectBox
            value={status}
            onChange={(value) =>
              setStatus(value as 'all' | CaseStatus)
            }
          >
            <option value="all">
              すべてのステータス
            </option>

            <option value="received">
              受付済み
            </option>

            <option value="reviewing">
              確認中
            </option>

            <option value="in_progress">
              対応中
            </option>

            <option value="waiting">
              書類待ち
            </option>

            <option value="waiting_payment">
              支払待ち
            </option>

            <option value="completed">
              完了
            </option>
          </SelectBox>

          <SelectBox
            value={caseType}
            onChange={setCaseType}
          >
            <option value="all">
              すべての案件種別
            </option>

            {caseTypes.map((type) => (
              <option
                key={type}
                value={type}
              >
                {type}
              </option>
            ))}
          </SelectBox>
        </div>
      </section>

      {/* ================================================= */}
      {/* LIST */}
      {/* ================================================= */}

      <section
        className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/80 dark:bg-[#111a2e] dark:shadow-none"
      >
        {/* HEADER */}

        <div
          className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-700/80 sm:px-5"
        >
          <div>
            <div className="flex items-center gap-2">
              <FileText
                size={15}
                className="text-indigo-600 dark:text-indigo-400"
              />

              <h2
                className="text-[14px] font-bold text-slate-900 dark:text-white"
              >
                案件一覧
              </h2>
            </div>

            <p
              className="mt-1 text-[10px] font-medium text-sky-600 dark:text-sky-300"
            >
              {filteredCases.length}件の案件
            </p>
          </div>

          <div
            className="hidden items-center gap-1.5 text-[10px] text-slate-400 sm:flex dark:text-slate-500"
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-emerald-500"
            />

            最新情報を表示中
          </div>
        </div>

        {/* ================================================= */}
        {/* DESKTOP TABLE */}
        {/* ================================================= */}

        <div className="hidden min-w-0 md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[1000px]">
              {/* TABLE HEADER */}

              <div
                className="grid grid-cols-[1.4fr_1fr_0.85fr_0.8fr_1fr_100px_28px] items-center border-b border-slate-200 bg-slate-50 px-5 py-3 text-[10px] font-bold text-sky-700 dark:border-slate-800 dark:bg-[#0c1425] dark:text-sky-300"
              >
                <div>顧客名</div>
                <div>案件種別 / 書類</div>
                <div>担当者</div>
                <div>ステータス</div>
                <div>メモ</div>
                <div>最終更新</div>
                <div />
              </div>

              {/* ROWS */}

              {!isLoading && filteredCases.map((item) => (
                <DesktopCaseRow
                  key={item.id}
                  item={item}
                  onOpen={handleOpenCase}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ================================================= */}
        {/* MOBILE */}
        {/* ================================================= */}

        <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
          {!isLoading && filteredCases.map((item) => (
            <MobileCaseCard
              key={item.id}
              item={item}
              onOpen={handleOpenCase}
            />
          ))}
        </div>

        {/* EMPTY */}

        {isLoading && (
          <div className="flex min-h-[240px] items-center justify-center text-sm text-slate-500">
            読み込み中です…
          </div>
        )}

        {loadError && (
          <p className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {loadError}
          </p>
        )}

        {!isLoading && !loadError && filteredCases.length === 0 && (
          <div
            className="flex min-h-[240px] flex-col items-center justify-center px-4 text-center"
          >
            <div
              className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
            >
              <Search
                size={19}
                className="text-slate-400 dark:text-slate-500"
              />
            </div>

            <p
              className="text-[13px] font-semibold text-slate-700 dark:text-slate-300"
            >
              該当する案件がありません
            </p>

            <p
              className="mt-1 text-[11px] text-slate-400 dark:text-slate-600"
            >
              検索条件を変更してください
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

/* ========================================================= */
/* DESKTOP ROW */
/* ========================================================= */

function DesktopCaseRow({
  item,
  onOpen,
}: {
  item: BusinessCase
  onOpen: (id: number) => void
}) {
  const progress = Math.min(
    100,
    (item.documentsDone / item.documentsTotal) * 100,
  )

  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      className="group grid w-full grid-cols-[1.4fr_1fr_0.85fr_0.8fr_1fr_100px_28px] items-center border-b border-slate-100 px-5 py-[17px] text-left transition last:border-b-0 hover:bg-slate-50 dark:border-slate-800/80 dark:hover:bg-[#162139]"
    >
      {/* CUSTOMER */}

      <div className="flex min-w-0 items-center gap-3.5">
        <CustomerAvatar name={item.customerName} />

        <div className="min-w-0">
          <p
            className="truncate text-[13px] font-bold text-slate-900 dark:text-slate-100"
          >
            {item.customerName}
          </p>

          <p
            className="mt-1 truncate text-[10px] font-medium text-sky-600 dark:text-sky-300"
          >
            {item.customerKana}
          </p>

          <p
            className="mt-1 text-[9px] text-slate-400 dark:text-slate-600"
          >
            {item.code}
          </p>
        </div>
      </div>

      {/* DOCUMENT */}

      <div className="pr-5">
        <p
          className="text-[12.5px] font-bold text-slate-800 dark:text-slate-100"
        >
          {item.caseType}
        </p>

        <DocumentProgress
          done={item.documentsDone}
          total={item.documentsTotal}
          progress={progress}
        />
      </div>

      {/* ASSIGNEE */}

      <div className="flex items-center gap-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-[#1b2941] dark:text-slate-300"
        >
          {item.assignee.charAt(0)}
        </div>

        <div>
          <p
            className="text-[12px] font-bold text-slate-800 dark:text-slate-200"
          >
            {item.assignee}
          </p>

          <p
            className="mt-0.5 text-[9px] text-slate-400 dark:text-slate-500"
          >
            {item.role}
          </p>
        </div>
      </div>

      {/* STATUS */}

      <StatusBadge status={item.status} />

      {/* MEMO */}

      <p
        className="truncate pr-4 text-[11px] text-slate-500 dark:text-slate-400"
      >
        {item.memo}
      </p>

      {/* UPDATED */}

      <span
        className="text-[9px] text-slate-400 dark:text-slate-600"
      >
        {item.updatedAt}
      </span>

      {/* ARROW */}

      <ChevronRight
        size={16}
        className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500 dark:text-slate-700 dark:group-hover:text-indigo-400"
      />
    </button>
  )
}

/* ========================================================= */
/* MOBILE CARD */
/* ========================================================= */

function MobileCaseCard({
  item,
  onOpen,
}: {
  item: BusinessCase
  onOpen: (id: number) => void
}) {
  const progress =
    (item.documentsDone / item.documentsTotal) * 100

  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      className="w-full px-4 py-4 text-left transition active:bg-slate-50 dark:active:bg-slate-800/40"
    >
      {/* CUSTOMER */}

      <div className="flex items-start gap-3">
        <CustomerAvatar name={item.customerName} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className="truncate text-[13px] font-bold text-slate-900 dark:text-white"
              >
                {item.customerName}
              </p>

              <p
                className="mt-0.5 truncate text-[10px] text-sky-600 dark:text-sky-300"
              >
                {item.customerKana}
              </p>
            </div>

            <StatusBadge status={item.status} />
          </div>

          <p
            className="mt-1 text-[9px] text-slate-400 dark:text-slate-600"
          >
            {item.code}
          </p>
        </div>
      </div>

      {/* CONTENT */}

      <div
        className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-[#0d1729]"
      >
        <div
          className="grid grid-cols-2 gap-x-4 gap-y-3"
        >
          <MobileInfo
            label="案件種別"
            value={item.caseType}
          />

          <MobileInfo
            label="担当者"
            value={`${item.assignee}・${item.role}`}
          />

          <div>
            <p
              className="text-[9px] font-medium text-slate-400 dark:text-slate-600"
            >
              必要書類
            </p>

            <DocumentProgress
              done={item.documentsDone}
              total={item.documentsTotal}
              progress={progress}
            />
          </div>

          <MobileInfo
            label="最終更新"
            value={item.updatedAt}
          />
        </div>

        <div
          className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800"
        >
          <p
            className="text-[9px] text-slate-400 dark:text-slate-600"
          >
            メモ
          </p>

          <div className="mt-1 flex items-center justify-between gap-3">
            <p
              className="min-w-0 flex-1 truncate text-[11px] text-slate-600 dark:text-slate-400"
            >
              {item.memo}
            </p>

            <ChevronRight
              size={16}
              className="shrink-0 text-slate-400 dark:text-slate-600"
            />
          </div>
        </div>
      </div>
    </button>
  )
}

/* ========================================================= */
/* SMALL COMPONENTS */
/* ========================================================= */

function CaseDetailPage({ caseFile, onBack }: { caseFile: CaseDetail; onBack: () => void }) {
  type DocumentRecord = CaseDetail['documents'][number]
  type DocumentForm = { title: string; category: string; file_url: string; version: string; status: string }

  const emptyDocument = (): DocumentForm => ({
    title: '',
    category: 'その他',
    file_url: '',
    version: '1',
    status: 'draft',
  })

  const [tab, setTab] = useState<'documents' | 'precedents' | 'meetings'>('documents')
  const [currentCase, setCurrentCase] = useState(caseFile)
  const [dialog, setDialog] = useState<'document' | 'precedent' | 'meeting' | null>(null)
  const [editingDocumentId, setEditingDocumentId] = useState<number | null>(null)
  const [deletingDocumentId, setDeletingDocumentId] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [document, setDocument] = useState<DocumentForm>(emptyDocument)
  const [precedent, setPrecedent] = useState({ title: '', citation: '', summary: '', relevance: '', source_url: '' })
  const [meeting, setMeeting] = useState({ meeting_date: new Date().toISOString().slice(0, 10), attendees: '', content: '', next_action: '', status: 'draft' })
  const records = tab === 'documents' ? currentCase.documents : tab === 'precedents' ? currentCase.precedents : currentCase.meeting_logs
  const businessCase = mapCaseFile(currentCase)

  const openDialog = (next: 'document' | 'precedent' | 'meeting') => {
    setSaveError(null)
    if (next === 'document') {
      setEditingDocumentId(null)
      setDocument(emptyDocument())
    }
    setDialog(next)
  }

  const openDocumentEdit = (record: DocumentRecord) => {
    setSaveError(null)
    setEditingDocumentId(record.id)
    setDocument({
      title: record.title,
      category: record.category,
      file_url: record.file_url ?? '',
      version: record.version,
      status: record.status,
    })
    setDialog('document')
  }

  const closeDialog = () => {
    if (isSaving) return
    setDialog(null)
    setEditingDocumentId(null)
    setSaveError(null)
  }

  const deleteDocument = async (record: DocumentRecord) => {
    const confirmed = window.confirm(`「${record.title}」を削除しますか？\nこの操作は取り消せません。`)
    if (!confirmed) return

    setSaveError(null)
    setDeletingDocumentId(record.id)

    try {
      await api.delete(`/case-files/${currentCase.id}/documents/${record.id}`)

      setCurrentCase((value) => ({
        ...value,
        documents: value.documents.filter((item) => item.id !== record.id),
        documents_count: Math.max(0, value.documents_count - 1),
        confirmed_documents_count: Math.max(
          0,
          value.confirmed_documents_count - (record.status === 'confirmed' ? 1 : 0),
        ),
      }))
    } catch {
      setSaveError('資料を削除できませんでした。もう一度お試しください。')
    } finally {
      setDeletingDocumentId(null)
    }
  }

  const saveRecord = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!dialog) return
    setIsSaving(true)
    setSaveError(null)

    try {
      if (dialog === 'document') {
        const payload = { ...document, file_url: document.file_url || null }

        if (editingDocumentId !== null) {
          const oldDocument = currentCase.documents.find((item) => item.id === editingDocumentId)
          const response = await api.patch<{ document: DocumentRecord }>(
            `/case-files/${currentCase.id}/documents/${editingDocumentId}`,
            payload,
          )

          setCurrentCase((value) => {
            const wasConfirmed = oldDocument?.status === 'confirmed'
            const isConfirmed = response.data.document.status === 'confirmed'
            const confirmedDelta = wasConfirmed === isConfirmed ? 0 : isConfirmed ? 1 : -1

            return {
              ...value,
              documents: value.documents.map((item) =>
                item.id === editingDocumentId ? response.data.document : item,
              ),
              confirmed_documents_count: Math.max(
                0,
                value.confirmed_documents_count + confirmedDelta,
              ),
            }
          })
        } else {
          const response = await api.post<{ document: DocumentRecord }>(
            `/case-files/${currentCase.id}/documents`,
            payload,
          )
          setCurrentCase((value) => ({
            ...value,
            documents: [response.data.document, ...value.documents],
            documents_count: value.documents_count + 1,
            confirmed_documents_count:
              value.confirmed_documents_count +
              (response.data.document.status === 'confirmed' ? 1 : 0),
          }))
        }

        setDocument(emptyDocument())
        setEditingDocumentId(null)
      }

      if (dialog === 'precedent') {
        const response = await api.post<{ precedent: CaseDetail['precedents'][number] }>(`/case-files/${currentCase.id}/precedents`, { ...precedent, citation: precedent.citation || null, summary: precedent.summary || null, relevance: precedent.relevance || null, source_url: precedent.source_url || null })
        setCurrentCase((value) => ({ ...value, precedents: [response.data.precedent, ...value.precedents] }))
        setPrecedent({ title: '', citation: '', summary: '', relevance: '', source_url: '' })
      }

      if (dialog === 'meeting') {
        const response = await api.post<{ meeting_log: CaseDetail['meeting_logs'][number] }>(`/case-files/${currentCase.id}/meeting-logs`, { ...meeting, attendees: meeting.attendees || null, next_action: meeting.next_action || null })
        setCurrentCase((value) => ({ ...value, meeting_logs: [response.data.meeting_log, ...value.meeting_logs] }))
        setMeeting({ meeting_date: new Date().toISOString().slice(0, 10), attendees: '', content: '', next_action: '', status: 'draft' })
      }

      setDialog(null)
    } catch {
      setSaveError(editingDocumentId !== null ? '資料を更新できませんでした。入力内容を確認してください。' : '保存できませんでした。必須項目とリンク形式を確認してください。')
    } finally {
      setIsSaving(false)
    }
  }

  const actionLabel = tab === 'documents' ? '資料・書面を追加' : tab === 'precedents' ? '判例・メモを追加' : '打合せ記録を追加'
  const dialogTitle = dialog === 'document'
    ? editingDocumentId !== null ? '資料・書面を編集' : '資料・書面を追加'
    : dialog === 'precedent'
      ? '判例・法令メモを追加'
      : '打合せ記録を追加'

  return <div className="w-full min-w-0 max-w-full px-3 pb-8 pt-3 sm:px-4 lg:px-6">
    <button type="button" onClick={onBack} className="mb-4 inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700 dark:border-slate-700 dark:bg-[#111a2e] dark:text-slate-200 dark:hover:border-indigo-400/50 dark:hover:text-indigo-300"><ChevronLeft size={17} />案件一覧に戻る</button>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#111a2e]">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-700"><div><p className="text-xs font-semibold text-sky-600">{currentCase.client.name}</p><h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{currentCase.title}</h1><p className="mt-2 text-sm text-slate-500">種類: {currentCase.case_type ?? '未分類'} ・ 担当: {currentCase.assigned_employee?.full_name ?? '未割当'}</p></div><StatusBadge status={businessCase.status}/></header>
      <nav className="flex overflow-x-auto border-b border-slate-200 px-4 dark:border-slate-700">{([['documents', '資料・書面'], ['precedents', '判例・法令メモ'], ['meetings', '打合せ記録']] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold ${tab === id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}>{label}</button>)}</nav>
      <div className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">{tab === 'documents' ? '案件に必要な資料と外部ファイルのリンクを管理します。' : tab === 'precedents' ? '参考となる判例・法令・調査メモを残します。' : '顧客や社内との打合せ内容を記録します。'}</p>
          <button type="button" onClick={() => openDialog(tab === 'documents' ? 'document' : tab === 'precedents' ? 'precedent' : 'meeting')} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white transition hover:bg-indigo-500"><Plus size={15}/>{actionLabel}</button>
        </div>

        {saveError && !dialog && (
          <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {saveError}
          </p>
        )}

        <div className="space-y-3">
          {records.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center dark:border-slate-600">
              <p className="text-sm font-medium text-slate-500">この記録はまだありません。</p>
              <button type="button" onClick={() => openDialog(tab === 'documents' ? 'document' : tab === 'precedents' ? 'precedent' : 'meeting')} className="mt-3 text-sm font-bold text-indigo-600">+ {actionLabel}</button>
            </div>
          ) : records.map((record) => (
            <article key={record.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              {'category' in record && <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-800 dark:text-slate-100">{record.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{record.category} ・ v{record.version} ・ {record.status}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openDocumentEdit(record)}
                      disabled={deletingDocumentId === record.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-[#0c1527] dark:text-slate-300 dark:hover:border-indigo-400/60 dark:hover:text-indigo-300"
                    >
                      <Pencil size={13}/>
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteDocument(record)}
                      disabled={deletingDocumentId === record.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-bold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:border-rose-400/50 dark:hover:bg-rose-500/15"
                    >
                      <Trash2 size={13}/>
                      {deletingDocumentId === record.id ? '削除中…' : '削除'}
                    </button>
                  </div>
                </div>
                {record.file_url && <a href={record.file_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-semibold text-indigo-600">資料リンクを開く</a>}
              </>}
              {'citation' in record && <><p className="font-bold text-slate-800 dark:text-slate-100">{record.title}</p>{record.citation && <p className="mt-1 text-xs text-slate-500">{record.citation}</p>}{record.summary && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{record.summary}</p>}{record.relevance && <p className="mt-2 text-sm text-slate-500">関連性: {record.relevance}</p>}</>}
              {'meeting_date' in record && <><div className="flex justify-between gap-3"><p className="font-bold text-slate-800 dark:text-slate-100">{record.meeting_date}</p><span className="text-xs text-slate-500">{record.status}</span></div>{record.attendees && <p className="mt-1 text-xs text-slate-500">出席者: {record.attendees}</p>}<p className="mt-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{record.content}</p>{record.next_action && <p className="mt-3 text-sm text-indigo-700">次の対応: {record.next_action}</p>}</>}
            </article>
          ))}
        </div>
      </div>
    </section>

    {dialog && <Dialog title={dialogTitle} onClose={closeDialog}>
      <form onSubmit={saveRecord} className="space-y-4">
        {dialog === 'document' && <>
          <FormField label="資料名 *"><input required value={document.title} onChange={(event) => setDocument({ ...document, title: event.target.value })} className={inputClass} placeholder="例：パスポート写し" /></FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="種類 *"><input required value={document.category} onChange={(event) => setDocument({ ...document, category: event.target.value })} className={inputClass} placeholder="例：本人確認書類" /></FormField>
            <FormField label="バージョン"><input required value={document.version} onChange={(event) => setDocument({ ...document, version: event.target.value })} className={inputClass} placeholder="例：1" /></FormField>
          </div>
          <FormField label="ステータス"><select value={document.status} onChange={(event) => setDocument({ ...document, status: event.target.value })} className={inputClass}><option value="draft">下書き</option><option value="submitted">提出済み</option><option value="confirmed">確認済み</option></select></FormField>
          <FormField label="資料リンク（任意）"><input type="url" value={document.file_url} onChange={(event) => setDocument({ ...document, file_url: event.target.value })} className={inputClass} placeholder="https://..." /></FormField>
          <p className="text-xs text-slate-500">ファイル本体は保存せず、Box・Google Drive等の資料リンクを登録します。</p>
        </>}
        {dialog === 'precedent' && <><FormField label="タイトル *"><input required value={precedent.title} onChange={(event) => setPrecedent({ ...precedent, title: event.target.value })} className={inputClass} /></FormField><FormField label="引用・法令番号"><input value={precedent.citation} onChange={(event) => setPrecedent({ ...precedent, citation: event.target.value })} className={inputClass} /></FormField><FormField label="要約"><textarea value={precedent.summary} onChange={(event) => setPrecedent({ ...precedent, summary: event.target.value })} className={textareaClass} /></FormField><FormField label="案件との関連"><input value={precedent.relevance} onChange={(event) => setPrecedent({ ...precedent, relevance: event.target.value })} className={inputClass} /></FormField></>}
        {dialog === 'meeting' && <><div className="grid gap-3 sm:grid-cols-2"><FormField label="日付 *"><input required type="date" value={meeting.meeting_date} onChange={(event) => setMeeting({ ...meeting, meeting_date: event.target.value })} className={inputClass} /></FormField><FormField label="出席者"><input value={meeting.attendees} onChange={(event) => setMeeting({ ...meeting, attendees: event.target.value })} className={inputClass} /></FormField></div><FormField label="内容 *"><textarea required value={meeting.content} onChange={(event) => setMeeting({ ...meeting, content: event.target.value })} className={textareaClass} /></FormField><FormField label="次の対応"><input value={meeting.next_action} onChange={(event) => setMeeting({ ...meeting, next_action: event.target.value })} className={inputClass} /></FormField></>}
        {saveError && <p className="text-sm font-medium text-rose-600">{saveError}</p>}
        <DialogActions onClose={closeDialog} submitting={isSaving} submitLabel={dialog === 'document' && editingDocumentId !== null ? '更新する' : '保存する'} />
      </form>
    </Dialog>}
  </div>
}

const inputClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-[#0c1527] dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20'
const textareaClass = 'min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-[#0c1527] dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20'

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
    <section className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#111a2e]">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700"><h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2><button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white">閉じる</button></header>
      <div className="p-5">{children}</div>
    </section>
  </div>
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700 dark:text-slate-200">{label}</span>{children}</label>
}

function DialogActions({ onClose, submitting, submitLabel }: { onClose: () => void; submitting: boolean; submitLabel: string }) {
  return <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-700"><button type="button" disabled={submitting} onClick={onClose} className="h-10 rounded-lg px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">キャンセル</button><button type="submit" disabled={submitting} className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? '保存中…' : submitLabel}</button></div>
}

function CustomerAvatar({
  name,
}: {
  name: string
}) {
  return (
    <div
      className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-[14px] font-bold text-indigo-600 dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-indigo-300"
    >
      {name.charAt(0)}
    </div>
  )
}

function DocumentProgress({
  done,
  total,
  progress,
}: {
  done: number
  total: number
  progress: number
}) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <div
        className="h-[4px] w-[70px] overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500"
          style={{
            width: `${Math.min(progress, 100)}%`,
          }}
        />
      </div>

      <span
        className="text-[9px] font-medium text-slate-400 dark:text-slate-500"
      >
        {done}/{total}
      </span>
    </div>
  )
}

function StatusBadge({
  status,
}: {
  status: CaseStatus
}) {
  const config = statusConfig[status]

  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${config.badge}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${config.dot}`}
      />

      {config.label}
    </span>
  )
}

function MobileInfo({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="min-w-0">
      <p
        className="text-[9px] font-medium text-slate-400 dark:text-slate-600"
      >
        {label}
      </p>

      <p
        className="mt-1 truncate text-[11px] font-semibold text-slate-700 dark:text-slate-300"
      >
        {value}
      </p>
    </div>
  )
}

function SelectBox({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <div
      className="relative w-full lg:w-[200px] lg:shrink-0"
    >
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 px-3 pr-9 text-[11px] font-medium text-slate-600 outline-none transition focus:border-indigo-400 focus:bg-white dark:border-slate-700 dark:bg-[#0c1527] dark:text-slate-300 dark:focus:border-indigo-500/60"
      >
        {children}
      </select>

      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
      />
    </div>
  )
}

export default BusinessQuest