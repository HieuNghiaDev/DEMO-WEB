import { isAxiosError } from 'axios'

export const taskFileRequiredMessage = 'ファイルを選択してください。'

export function assertTaskUploadFile(value: unknown): asserts value is File {
  if (typeof File === 'undefined' || !(value instanceof File)) throw new Error(taskFileRequiredMessage)
}

export function taskUploadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === taskFileRequiredMessage) return taskFileRequiredMessage
  if (!isAxiosError(error)) return 'ファイルのアップロードに失敗しました。もう一度お試しください。'
  const status = error.response?.status
  if (status === 401) return 'セッションが切れました。再ログインしてください。'
  if (status === 403) return 'このタスクにファイルを提出する権限がありません。'
  if (status === 404) return 'このタスクを取得できませんでした。再読み込みしてください。'
  if (status === 422) {
    const messages: unknown = error.response?.data?.errors?.file
    const text = Array.isArray(messages) ? messages.filter((value): value is string => typeof value === 'string').join(' ') : ''
    if (/required|必須/i.test(text)) return taskFileRequiredMessage
    if (/greater|kilobytes|maximum|too large|サイズ|上限/i.test(text)) return 'ファイルのサイズが上限を超えています。サイズを確認してください。'
    return '提出ファイルまたはタスクの状態を確認してください。ファイルは提出されていません。'
  }
  if (status === 503) return 'ファイルをGoogle Driveに保存できませんでした。時間をおいて再試行してください。'
  return 'ファイルのアップロードに失敗しました。接続を確認して再試行してください。'
}
