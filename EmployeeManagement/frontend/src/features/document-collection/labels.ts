import type { CollectionPriority, CollectionResult, CollectionStatus, FulfillmentStatus, NecessityStatus, ReviewStatus } from './types'

export const necessityLabels: Record<NecessityStatus, string> = { undetermined: '未判定', required: '必要', not_required: '不要' }
export const collectionLabels: Record<CollectionStatus, string> = { not_started: '未着手', preparing: '準備中', requested: '依頼済み', partially_received: '一部受領', received: '受領済み', difficult: '取得困難', closed: '終了' }
export const fulfillmentLabels: Record<FulfillmentStatus, string> = { undetermined: '未判定', insufficient: '不足あり', satisfied: '充足', satisfied_by_alternative: '代替資料で充足' }
export const reviewLabels: Record<ReviewStatus, string> = { unreviewed: '未確認', reviewing: '確認中', reviewed: '確認済み', returned: '差戻し' }
export const resultLabels: Record<CollectionResult, string> = { not_exist: '不存在', not_disclosed: '不開示', partially_disclosed: '一部不開示', custodian_unknown: '保管先不明', other: 'その他' }
export const priorityLabels: Record<CollectionPriority, string> = { low: '低', normal: '通常', high: '高', critical: '最優先' }
export const statusGroups = [
  { field: 'necessity_status', label: '取得要否', labels: necessityLabels },
  { field: 'collection_status', label: '取得作業', labels: collectionLabels },
  { field: 'collection_result', label: '結果・例外', labels: resultLabels },
  { field: 'fulfillment_status', label: '充足', labels: fulfillmentLabels },
  { field: 'review_status', label: '確認', labels: reviewLabels },
] as const
