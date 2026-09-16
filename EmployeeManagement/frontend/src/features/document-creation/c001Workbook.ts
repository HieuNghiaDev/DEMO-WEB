import api from '../../services/api'

function workbookFilename(disposition: string | undefined): string {
  let name = 'C-001.xlsx'
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const plain = disposition?.match(/filename="([^"]+)"/i)?.[1]
  try { name = encoded ? decodeURIComponent(encoded) : plain || name } catch { /* Use the safe fallback. */ }
  name = name.replace(/[\p{C}<>:"/\\|?*%]/gu, '_').replace(/\.{2,}/g, '_').replace(/^[. ]+|[. ]+$/g, '')
  return name.toLowerCase().endsWith('.xlsx') ? name : 'C-001.xlsx'
}

export async function fetchC001Workbook(caseId: number, documentId: number, version: number) {
  const response = await api.get<Blob>(
    `/case-files/${caseId}/document-collection/${documentId}/creation/c001/download?version=${version}`,
    { responseType: 'blob' },
  )
  if (response.data.size === 0) throw new Error('C-001を取得できませんでした。')

  return { blob: response.data, filename: workbookFilename(response.headers['content-disposition']) }
}

export function saveWorkbookDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  try {
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
