import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ImportResult, PackageRecord } from '../../shared/types'
import { api } from './api'
import PackageCard from './components/PackageCard'

export default function App(): JSX.Element {
  const [packages, setPackages] = useState<PackageRecord[]>([])
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [toast, setToast] = useState<string>('')

  const refresh = useCallback(async () => {
    setPackages(await api.list())
  }, [])

  useEffect(() => {
    refresh()
    api.onImported((result: ImportResult) => {
      notify(result)
      refresh()
    })
  }, [refresh])

  const notify = (r: ImportResult): void => {
    setToast(r.message)
    window.setTimeout(() => setToast(''), 3000)
  }

  const doImport = async (kind: 'file' | 'folder'): Promise<void> => {
    const r = kind === 'file' ? await api.importDialog() : await api.importFolderDialog()
    if (r.message !== '已取消') notify(r)
    refresh()
  }

  const allTags = useMemo(
    () => [...new Set(packages.flatMap((p) => p.tags ?? []))],
    [packages]
  )

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    return packages.filter((p) => {
      const matchKw =
        !kw ||
        p.name.toLowerCase().includes(kw) ||
        (p.author ?? '').toLowerCase().includes(kw) ||
        (p.tags ?? []).some((t) => t.toLowerCase().includes(kw))
      const matchTag = !activeTag || (p.tags ?? []).includes(activeTag)
      return matchKw && matchTag
    })
  }, [packages, search, activeTag])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🌍</span>
          <h1>GeoBox 地理课件舱</h1>
        </div>
        <div className="actions">
          <input
            className="search"
            placeholder="搜索课件 / 作者 / 标签…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn primary" onClick={() => doImport('file')}>
            导入课件包
          </button>
          <button className="btn" onClick={() => doImport('folder')}>
            从文件夹导入
          </button>
        </div>
      </header>

      {allTags.length > 0 && (
        <div className="tagbar">
          <span
            className={`tag ${activeTag === null ? 'active' : ''}`}
            onClick={() => setActiveTag(null)}
          >
            全部
          </span>
          {allTags.map((t) => (
            <span
              key={t}
              className={`tag ${activeTag === t ? 'active' : ''}`}
              onClick={() => setActiveTag(activeTag === t ? null : t)}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <main className="grid">
        {filtered.length === 0 ? (
          <div className="empty">
            <p className="empty-icon">📦</p>
            <p>还没有课件</p>
            <p className="empty-hint">
              点击「导入课件包」导入 .gpak 文件，或「从文件夹导入」你 vibe coding 的网页课件项目
            </p>
          </div>
        ) : (
          filtered.map((p) => (
            <PackageCard
              key={p.id}
              pkg={p}
              onOpen={async () => {
                const ok = await api.openPackage(p.id)
                if (!ok) notify({ ok: false, message: '打开失败：课件文件缺失' })
              }}
              onExport={async () => notify(await api.exportPackage(p.id))}
              onDelete={async () => {
                if (window.confirm(`确定删除「${p.name}」？此操作不可恢复。`)) {
                  notify(await api.deletePackage(p.id))
                  refresh()
                }
              }}
            />
          ))
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
