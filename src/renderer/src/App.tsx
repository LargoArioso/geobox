import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ImportResult, PackageRecord, ResourceRecord } from '../../shared/types'
import { api } from './api'
import PackageCard from './components/PackageCard'
import ResourceList from './components/ResourceList'

type Tab = 'packages' | 'resources'

export default function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('packages')
  const [packages, setPackages] = useState<PackageRecord[]>([])
  const [resources, setResources] = useState<ResourceRecord[]>([])
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [toast, setToast] = useState<string>('')

  const refresh = useCallback(async () => {
    setPackages(await api.list())
    setResources(await api.listResources())
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

  const doUploadResource = async (): Promise<void> => {
    const r = await api.addResources()
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

  const filteredResources = useMemo(() => {
    const kw = search.trim().toLowerCase()
    if (!kw) return resources
    return resources.filter(
      (r) => r.title.toLowerCase().includes(kw) || r.kind.toLowerCase().includes(kw)
    )
  }, [resources, search])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-word">GeoBox</span>
          <span className="brand-sub">地理课件舱</span>
        </div>
        <nav className="tabs">
          <span
            className={`tab ${tab === 'packages' ? 'active' : ''}`}
            onClick={() => setTab('packages')}
          >
            课件 <em>{packages.length}</em>
          </span>
          <span
            className={`tab ${tab === 'resources' ? 'active' : ''}`}
            onClick={() => setTab('resources')}
          >
            资料 <em>{resources.length}</em>
          </span>
        </nav>
        <div className="actions">
          <input
            className="search"
            placeholder={tab === 'packages' ? '搜索课件 / 作者 / 标签…' : '搜索资料…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {tab === 'packages' ? (
            <>
              <button className="btn primary" onClick={() => doImport('file')}>
                导入课件包
              </button>
              <button className="btn" onClick={() => doImport('folder')}>
                从文件夹导入
              </button>
            </>
          ) : (
            <button className="btn primary" onClick={doUploadResource}>
              上传资料
            </button>
          )}
        </div>
      </header>

      {tab === 'packages' && allTags.length > 0 && (
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

      {tab === 'packages' ? (
        <main className="grid">
          {filtered.length === 0 ? (
            <div className="empty">
              <p className="empty-title">Empty Library</p>
              <p className="empty-hint">
                还没有课件。点击「导入课件包」导入 .gpak 文件，
                或「从文件夹导入」你 vibe coding 的网页课件项目——
                补一个 manifest.json 即可上架。
              </p>
            </div>
          ) : (
            filtered.map((p, i) => (
              <PackageCard
                key={p.id}
                pkg={p}
                index={i}
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
      ) : (
        <main className="resources">
          <ResourceList
            resources={filteredResources}
            onOpen={async (id) => notify(await api.openResource(id))}
            onDelete={async (id) => {
              const rec = resources.find((r) => r.id === id)
              if (window.confirm(`确定删除「${rec?.title ?? ''}」？`)) {
                notify(await api.deleteResource(id))
                refresh()
              }
            }}
          />
          <p className="res-footnote">
            预置资料为课程标准要点整理；人教版等教材受版权保护，请通过「上传资料」添加自己合法获得的电子版（PDF）。
          </p>
        </main>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
