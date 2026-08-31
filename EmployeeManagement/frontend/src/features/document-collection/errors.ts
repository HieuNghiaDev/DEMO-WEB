import axios from 'axios'
export interface CollectionError { message: string; status?: number; fields: Record<string, string>; retryable: boolean }
export function collectionError(error: unknown): CollectionError {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  const fields: Record<string, string> = {}
  if (status === 422 && axios.isAxiosError(error)) {
    const errors: unknown = error.response?.data?.errors
    if (errors && typeof errors === 'object') for (const [key, value] of Object.entries(errors)) {
      if (Array.isArray(value) && typeof value[0] === 'string') fields[key] = value[0]
    }
  }
  const messages: Record<number, string> = {
    401: 'ログインの有効期限が切れています。再度ログインしてください。',
    403: 'この操作を行う権限がありません。管理者に確認してください。',
    404: '案件または資料が見つかりません。一覧を再読み込みしてください。',
    422: '入力内容または資料収集の設定を確認してください。',
    429: '操作が集中しています。少し時間をおいて再試行してください。',
  }
  return { status, fields, message: (status && messages[status]) || '資料収集データを取得・保存できませんでした。接続を確認して再試行してください。', retryable: !status || status >= 500 || status === 429 }
}
