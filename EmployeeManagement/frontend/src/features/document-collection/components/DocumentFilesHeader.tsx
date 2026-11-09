import { FileText } from 'lucide-react'
import type { ReactNode } from 'react'
import './documentFiles.css'

export default function DocumentFilesHeader({ count, children }: { count: number; children?: ReactNode }) {
  return <header className="dc-compact-files-header">
    <div className="dc-compact-files-heading"><span className="dc-compact-files-icon"><FileText size={20} aria-hidden="true"/></span><div><h3>ファイル <small>({count})</small></h3><p>資料のアップロード・バージョン管理・確認を行います。</p></div></div>
    {children && <div className="dc-compact-files-header-actions">{children}</div>}
  </header>
}
