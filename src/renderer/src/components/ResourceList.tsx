import type { ResourceRecord } from '../../../shared/types'

interface Props {
  resources: ResourceRecord[]
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}

function fmtSize(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function kindIcon(kind: string): string {
  if (kind === '课程标准') return '§'
  if (kind === '教材') return '✎'
  return '❏'
}

export default function ResourceList({ resources, onOpen, onDelete }: Props): JSX.Element {
  if (resources.length === 0) {
    return (
      <div className="empty">
        <p className="empty-title">No Resources</p>
        <p className="empty-hint">
          还没有教学资料。点击「上传资料」加入教材 PDF、课标文档等。
          提示：人教版教材受版权保护，请上传自己合法获得的电子版。
        </p>
      </div>
    )
  }
  return (
    <div className="res-list">
      {resources.map((r) => (
        <div key={r.id} className="res-row" onDoubleClick={() => onOpen(r.id)}>
          <span className="res-icon">{kindIcon(r.kind)}</span>
          <div className="res-main">
            <span className="res-title" title={r.filename}>
              {r.title}
            </span>
            <span className="res-meta">
              {r.kind} · {fmtSize(r.size)}
              {r.builtin && <span className="badge inline">预置</span>}
            </span>
          </div>
          <div className="res-actions">
            <button className="btn primary" onClick={() => onOpen(r.id)}>
              打开
            </button>
            {!r.builtin && (
              <button className="btn danger" onClick={() => onDelete(r.id)}>
                删除
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
