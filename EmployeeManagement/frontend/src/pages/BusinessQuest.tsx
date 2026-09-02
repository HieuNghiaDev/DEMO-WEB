import { useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { CaseWorkspaceView } from '../features/case-workspace/CaseWorkspacePage'
import CaseFormPage from '../features/case-management/CaseFormPage'
import NewCaseDialog from '../features/case-management/NewCaseDialog'
import { caseApi, caseError } from '../features/case-management/api'
import { caseTypeOptions, filterCases } from '../features/case-management/helpers'
import type { CaseEmployee, CaseViewer } from '../features/case-management/types'
import CaseListView from './business-quest/CaseListView'
import { mapCaseFile } from './business-quest/helpers'
import type { BusinessCase, CaseQuickFilter, CaseStatus } from './business-quest/types'

export default function BusinessQuest() {
  const { user } = useAuth()
  return <CaseManagement user={user}/>
}

// Route orchestration is independent of authentication storage; the app supplies its authenticated viewer.
export function CaseManagement({ user }: { user: CaseViewer }) {
  const { pathname } = useLocation()
  // A detail/form route must not inherit the previous list's scroll position.
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }) }, [pathname])
  return <Routes>
    <Route index element={<CaseListPage user={user}/>}/>
    <Route path="new" element={<Navigate to="/quests" replace/>}/>
    <Route path=":caseId/edit" element={<CaseFormPage key="edit" user={user}/>}/>
    <Route path=":caseId" element={<CaseDetailRoute user={user}/>}/>
    <Route path="*" element={<Navigate to="/quests" replace/>}/>
  </Routes>
}
function CaseDetailRoute({ user }: { user: CaseViewer }) {
  const { caseId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  if (!caseId || !/^[1-9]\d*$/.test(caseId)) return <Navigate to="/quests" replace/>
  return <CaseWorkspaceView key={caseId} user={user} caseId={Number(caseId)} onBack={() => navigate('/quests')} onEdit={() => navigate(`/quests/${caseId}/edit`)} initialNotice={location.state?.caseNotice}/>
}
function CaseListPage({ user }: { user: CaseViewer }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [cases, setCases] = useState<BusinessCase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<'all' | CaseStatus>('all')
  const [caseType, setCaseType] = useState('all')
  const [quick, setQuick] = useState<CaseQuickFilter>('all')
  const [employees, setEmployees] = useState<CaseEmployee[]>([])
  const [assigning, setAssigning] = useState<number | null>(null)
  const canCreate = user?.permission_names.includes('case.create') ?? false
  const canAssign = (user?.permission_names.includes('case.assign') ?? false) && (user?.role_names.some(role => role === 'level_4' || role === 'level_5') ?? false)
  const canRead = user?.permission_names.includes('case.view') ?? false
  const [refresh, setRefresh] = useState(0)
  const [creating, setCreating] = useState(false)
  useEffect(() => {
    if (!canRead) return
    let active = true
    Promise.all([caseApi.list(), caseApi.types().catch(() => [])]).then(([items, catalog]) => {
      if (!active) return
      const paths = new Map(caseTypeOptions(catalog).map(type => [type.id, type.label]))
      setCases(items.map(item => mapCaseFile(item, paths.get(item.case_type_id ?? 0))))
      setError(null)
    })
      .catch(requestError => { if (active) setError(caseError(requestError).message) })
      .finally(() => { if (active) setLoading(false) })
    if (canAssign) void caseApi.employees().then(items => { if (active) setEmployees(items.filter(employee => employee.employee_status === 'active')) }).catch(() => { if (active) setEmployees([]) })
    return () => { active = false }
  }, [canRead, canAssign, refresh])
  const types = useMemo(() => Array.from(new Set(cases.map(item => item.caseType))), [cases])
  const filtered = useMemo(() => filterCases(cases, keyword, status, caseType, quick), [cases, keyword, status, caseType, quick])
  const assign = async (id: number, employeeId: number | null) => {
    if (assigning !== null) return
    setAssigning(id)
    try {
      const item = await caseApi.assign(id, employeeId)
      // The assign endpoint does not include counts; retain list counters until the next fetch.
      setCases(current => current.map(row => row.id === id ? { ...row, assignee: item.assigned_employee?.full_name ?? '未割当', assignedEmployeeId: item.assigned_employee?.id ?? null, role: item.assigned_employee?.position_title ?? '担当者' } : row))
    } catch (requestError) { setError(caseError(requestError).message) } finally { setAssigning(null) }
  }
  return <>
    <CaseListView cases={cases} filteredCases={filtered} loading={canRead && loading} error={canRead ? error : t('cases.list.readPermissionRequired')} keyword={keyword} status={status} caseType={caseType} quickFilter={quick} caseTypes={types} canCreate={canCreate} canAssign={canAssign && employees.length > 0} assignees={employees} assigningCaseId={assigning} onKeywordChange={setKeyword} onStatusChange={setStatus} onCaseTypeChange={setCaseType} onQuickFilterChange={setQuick} onRefresh={() => { setLoading(true); setRefresh(value => value + 1) }} onCreate={() => setCreating(true)} onOpen={id => navigate(`/quests/${id}`)} onAssign={(id, employeeId) => void assign(id, employeeId)}/>
    {creating && <NewCaseDialog
      user={user}
      onClose={() => setCreating(false)}
      onCreated={id => { setCreating(false); navigate(`/quests/${id}`, { state: { caseNotice: '案件を作成しました。資料収集候補は「資料収集」から確認できます。' } }) }}
    />}
  </>
}
