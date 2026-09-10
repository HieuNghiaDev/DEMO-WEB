import api from '../../services/api'

export function pdfFilename(disposition: string | undefined): string {
  let name = 'document.pdf'
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const plain = disposition?.match(/filename="([^"]+)"/i)?.[1]
  try { name = encoded ? decodeURIComponent(encoded) : plain || name } catch { /* Use the safe fallback. */ }
  name = name.replace(/[\p{C}<>:"/\\|?*%]/gu, '_').replace(/\.{2,}/g, '_').replace(/^[. ]+|[. ]+$/g, '')
  return name.toLowerCase().endsWith('.pdf') ? name : 'document.pdf'
}

export async function fetchDocumentPdf(caseId: number, documentId: number, version?: number) {
  const query = version ? `?version=${version}` : ''
  const response = await api.get<Blob>(`/case-files/${caseId}/document-collection/${documentId}/creation/pdf${query}`, { responseType: 'blob' })
  if (!response.data.type.toLowerCase().startsWith('application/pdf') || await response.data.slice(0, 5).text() !== '%PDF-') {
    throw new Error('PDFを取得できませんでした。')
  }
  return { blob: response.data, filename: pdfFilename(response.headers['content-disposition']) }
}

export function savePdfDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  try {
    link.href = url; link.download = filename
    document.body.appendChild(link); link.click()
  } finally {
    link.remove()
    // Allow the browser to consume the Blob before releasing it.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
