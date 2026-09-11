import type { PackageRecord } from '../../../shared/types'

interface Props {
  pkg: PackageRecord
  onOpen: () => void
  onExport: () => void
  onDelete: () => void
}

export default function PackageCard({ pkg, onOpen, onExport, onDelete }: Props): JSX.Element {
  return (
    <div className="card" onDoubleClick={onOpen}>
      <div className="card-cover">
        <span className="cover-icon">🗺️</span>
        {pkg.source === 'builtin' && <span className="badge">预置</span>}
      </div>
      <div className="card-body">
        <h3 className="card-title" title={pkg.name}>
          {pkg.name}
        </h3>
        <p className="card-meta">
          {pkg.author || '未知作者'} · v{pkg.version || '1.0.0'}
        </p>
        <div className="card-tags">
          {(pkg.tags ?? []).map((t) => (
            <span key={t} className="tag small">
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="card-actions">
        <button className="btn primary" onClick={onOpen}>
          打开
        </button>
        <button className="btn" onClick={onExport}>
          导出
        </button>
        <button className="btn danger" onClick={onDelete}>
          删除
        </button>
      </div>
    </div>
  )
}
