import { officialCandidates } from './officialCandidates.ts'
import type { CaseKind, CollectionFilters, CollectionItem, ReceivedFile } from './types.ts'

export const REVIEW_DATE = '2026-08-31'
export const purposeNames: Record<string, string> = {
  COMMON: '共通書類', W1: '契約内容・労働条件', W2: '事故態様・会社等の責任', W3: '損害内容・労災給付',
  W4: '第三者機関からの取得・審査請求', W5: '労基署・警察署への告訴・告発',
  T1: '事故の発生・態様・責任関係', T2: '人身損害', T3: '物的損害', T4: '保険・既払金・交渉経過', T5: '資料取得の権限書類',
}
export const emptyFilters: CollectionFilters = { query: '', purpose: '', source: '', status: '', assignee: '', deadline: '', quick: '' }
export function isOverdue(item: CollectionItem) {
  return item.necessity !== '不要' && !!item.deadline && item.deadline < REVIEW_DATE && !['受領済み', '終了'].includes(item.collection)
}
export function needsAttention(item: CollectionItem) {
  return item.necessity !== '不要' && (item.necessity === '未判定' || item.review !== '確認済み' || item.sufficiency === '不足あり' || item.approval === '承認待ち')
}
export function matchesFilters(item: CollectionItem, filters: CollectionFilters) {
  const normalize = (value: string) => value.toLowerCase().replaceAll('-', '').replaceAll(' ', '')
  const [axis, status] = filters.status.split(':')
  const statuses: Record<string, string> = { necessity: item.necessity, collection: item.collection, sufficiency: item.sufficiency, review: item.review, exception: item.exception, approval: item.approval }
  return (!filters.query || normalize(`${item.code} ${item.title}`).includes(normalize(filters.query)))
    && (!filters.purpose || item.purposes.includes(filters.purpose))
    && (!filters.source || item.source === filters.source)
    && (!filters.assignee || item.assignee === filters.assignee)
    && (!filters.status || statuses[axis] === status)
    && (!filters.deadline || (filters.deadline === 'overdue' ? isOverdue(item) : filters.deadline === 'unset' ? !item.deadline : !!item.deadline && item.deadline >= REVIEW_DATE && item.deadline <= '2026-09-07'))
    && (!filters.quick || (filters.quick === '要対応' ? needsAttention(item) : filters.quick === '期限超過' ? isOverdue(item) : filters.quick === '保全優先' ? item.priority === '保全優先' : item.necessity === '未判定'))
}

// Dates, people, decisions and files below are explicit fictional review scenarios.
// Master conditions never decide necessity. Fresh preview candidates stay undecided.
export function createPreviewItems(caseType: CaseKind, populated = true): CollectionItem[] {
  const items: CollectionItem[] = officialCandidates.filter(rule => rule.caseType === caseType).map(rule => ({
    ...rule, purposes: [...rule.purposes], id: `${caseType}-${rule.code}`, origin: '候補',
    necessity: '未判定', collection: '未着手', sufficiency: '未判定', review: '未確認', exception: 'なし', approval: '未申請',
    assignee: '未割当', deadline: '', requested: '', periodStart: '', periodEnd: '', method: '',
    decisionReason: '', decidedBy: '', decidedAt: '', priority: rule.preservation ? '保全優先' : '通常',
    prerequisite: '', authorityStatus: '未確認', files: [],
    history: [{ id: `${rule.code}-created`, at: '2026/08/31 09:00', actor: 'LE HIEU NGHIA', action: '候補リストを作成（デモ）', reason: '公式ルール v1 を保存。必要性は未判定。' }],
  }))
  if (!populated) return items
  const patch = (code: string, changes: Partial<CollectionItem>, reason: string) => {
    const item = items.find(item => item.code === code)
    if (!item) return
    Object.assign(item, changes)
    if (changes.necessity && changes.necessity !== '未判定') Object.assign(item, { decisionReason: reason, decidedBy: '担当弁護士（デモ）', decidedAt: '2026/08/31 09:20' })
    item.history.unshift({ id: `${code}-scenario`, at: '2026/08/31 10:20', actor: '担当弁護士（デモ）', action: `${item.necessity} / ${item.collection} / ${item.review}`, reason })
  }
  const file = (code: string, name: string, version = 1): ReceivedFile => ({ id: `${code}-file-v${version}`, name, version, received: REVIEW_DATE, actor: 'LE HIEU NGHIA', format: '写し', returnStatus: '返却不要', purposes: items.find(item => item.code === code)?.purposes ?? [] })
  patch('C-001', { necessity: '必要', collection: '受領済み', sufficiency: '充足', review: '確認済み', assignee: 'LE HIEU NGHIA', files: [{ ...file('C-001', '委任契約書_署名済.pdf'), format: '原本', returnStatus: '2026/08/31 依頼者へ返却済み・控え保存' }] }, '受任範囲・署名を確認。原本を依頼者へ返却し、控えと返却記録を保存（デモ）。')
  patch('C-002', { necessity: '必要', collection: '準備中', assignee: 'LE HIEU NGHIA', authorityStatus: '要確認' }, '民事手続の委任範囲を確認中。医療機関用の同意書には代替しない。')
  patch('W-101', { necessity: '必要', collection: '依頼済み', assignee: 'LE HIEU NGHIA', deadline: '2026-09-05', requested: '2026-08-28' }, '雇用契約の条件確認のため。依頼済みの架空シナリオ。')
  patch('D-001', { necessity: '必要', collection: '一部受領', sufficiency: '不足あり', review: '確認中', assignee: 'LE HIEU NGHIA', deadline: '2026-08-28', source: '依頼者', files: [{ ...file('D-001', '給与明細_2026年01-02月.pdf'), url: 'https://drive.google.com/file/d/DEMO-PAYSLIP/view' }] }, '3月分が不足。労災ではW1・W3、交通事故ではT2の確認に使用。追加依頼の文案準備。')
  patch('D-002', { necessity: '必要', collection: '受領済み', sufficiency: '未判定', review: '未確認', assignee: 'LE HIEU NGHIA', files: [file('D-002', '源泉徴収票_2025.pdf')] }, '受領登録のみ完了。内容の確認はまだ行っていない。')
  patch('D-003', { necessity: '必要', collection: '依頼済み', assignee: 'LE HIEU NGHIA', deadline: '2026-09-05', requested: '2026-08-28', source: '大阪病院', target: 'NGUYEN VAN A', periodStart: '2026-01-01', periodEnd: '2026-03-31', method: '医療機関へ書面請求', prerequisite: 'A-003 同意書・委任状（医療機関宛て）', authorityStatus: '取得済み' }, '大阪病院での治療内容を確認。宛先・対象期間・同意範囲を確認済み（デモ）。')
  const hospital = items.find(item => item.code === 'D-003')!
  items.push({ ...structuredClone(hospital), id: `${caseType}-D-003-kyoto`, origin: '案件で追加', source: '京都病院', periodStart: '2026-04-01', periodEnd: '2026-06-30', collection: '一部受領', sufficiency: '不足あり', review: '差戻し', files: [file('D-003', '京都病院_診断書.pdf'), file('D-003', '京都病院_診断書_追補.pdf', 2)], decisionReason: '京都病院・別期間の治療内容を別項目で確認。', history: [{ id: 'kyoto-return', at: '2026/08/31 11:40', actor: '担当弁護士（デモ）', action: '差戻し・追加依頼', reason: '署名ページが不足。旧版 v1 を残し、追補 v2 を登録。再確認が必要。' }] })
  patch('D-004', { necessity: '必要', collection: '準備中', approval: '承認待ち', assignee: 'LE HIEU NGHIA', prerequisite: 'A-003 同意書・委任状（医療機関宛て）', authorityStatus: '準備中' }, '対象期間・同意範囲を弁護士が確認後に請求する。外部送信は未実施。')
  patch('D-011', { necessity: '不要', collection: '未着手' }, '本デモは死亡事案ではないことを担当弁護士が確認。')
  patch('W-202', { necessity: '必要', collection: '終了', exception: '不存在', review: '確認済み' }, '照会回答により、この災害の調査復命書は作成されていないと確認（デモ）。')
  patch('W-201', { necessity: '必要', collection: '終了', exception: '一部不開示', sufficiency: '不足あり', review: '確認中' }, '不開示部分と決定理由を保存。審査請求の要否は弁護士が別途判断。')
  patch('W-106', { necessity: '必要', collection: '取得困難', exception: '保管先不明', assignee: 'LE HIEU NGHIA' }, '当時の規程の保管先が不明。会社へ確認するための追加依頼案を準備。')
  patch('W-210', { necessity: '必要', collection: '準備中', priority: '保全優先', deadline: '2026-08-30', assignee: 'LE HIEU NGHIA', approval: '承認待ち' }, '保存期間・上書き予定の確認が必要。保全依頼は弁護士承認待ち。')
  return items
}
