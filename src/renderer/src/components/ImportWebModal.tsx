import { useState } from 'react'
import type { ImportResult, WebImportPayload, WebImportPrepare } from '../../../shared/types'
import { api } from '../api'

interface Props {
  onCancel: () => void
  onDone: (result: ImportResult) => void
}

/**
 * 统一导入向导：窗口内选择来源（.gpak / 入口 html / 文件夹），自动识别。
 * 来源自带 manifest 时直接入库；否则在窗口内补全信息，自动生成 manifest.json。
 */
export default function ImportWebModal({ onCancel, onDone }: Props): JSX.Element {
  const [source, setSource] = useState<WebImportPrepare | null>(null)
  const [imported, setImported] = useState<ImportResult | null>(null)
  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [subject, setSubject] = useState('地理')
  const [tags, setTags] = useState('')
  const [version, setVersion] = useState('1.0.0')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const pick = async (kind: 'file' | 'folder'): Promise<void> => {
    setError('')
    const r = kind === 'file' ? await api.pickImportFile() : await api.pickImportFolder()
    if (r.kind === 'canceled') return
    if (r.kind === 'imported' && r.result) {
      if (r.result.ok) setImported(r.result)
      else setError(r.result.message)
      return
    }
    if (r.kind === 'prepare' && r.prepare) {
      setSource(r.prepare)
      setName(r.prepare.suggestedName ?? '')
    }
  }

  const submit = async (): Promise<void> => {
    if (!source) return
    if (!name.trim()) {
      setError('请填写课件名称')
      return
    }
    setBusy(true)
    const payload: WebImportPayload = {
      rootDir: source.rootDir!,
      entry: source.entry!,
      name,
      author,
      subject,
      version,
      tags: tags
        .split(/[,，、\s]+/)
        .map((t) => t.trim())
        .filter(Boolean)
    }
    const result = await api.importWeb(payload)
    setBusy(false)
    if (result.ok) onDone(result)
    else setError(result.message)
  }

  return (
    <div className="modal-mask" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-kicker">IMPORT COURSEWARE</span>
          <h3 className="modal-title">导入课件</h3>
          <p className="modal-sub">
            支持三种来源，<b>自动识别</b>：① <code>.gpak</code>{' '}
            课件包（同事分享的成品，也可直接双击文件导入）；② 网页课件文件夹（含图片等素材的整个目录）；
            ③ 单个入口 <code>html</code>（其所在文件夹即课件）。来源自带课件信息时直接入库，
            否则在下方补全信息，<code>manifest.json</code> 会自动生成。
          </p>
        </div>

        {imported ? (
          <div className="modal-success">
            <p className="modal-success-icon">✓</p>
            <p className="modal-success-text">{imported.message}</p>
            <div className="modal-actions">
              <button className="btn primary" onClick={() => onDone(imported)}>
                完成
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="pick-row">
              <button className="pick-btn" onClick={() => pick('file')} disabled={busy}>
                <span className="pick-btn-title">选择文件</span>
                <span className="pick-btn-sub">.gpak 课件包 / 入口 html</span>
              </button>
              <button className="pick-btn" onClick={() => pick('folder')} disabled={busy}>
                <span className="pick-btn-title">选择文件夹</span>
                <span className="pick-btn-sub">整个课件目录（含素材）</span>
              </button>
            </div>

            {source && (
              <>
                <div className="modal-path">
                  <span className="modal-path-label">课件目录</span>
                  <span className="modal-path-value">{source.rootDir}</span>
                  <span className="modal-path-hint">
                    入口 {source.entry} · 目录内图片等素材将一并导入
                    {source.hasManifest ? ' · 检测到已有 manifest，将按其 id 覆盖更新' : ''}
                  </span>
                </div>

                <label className="field">
                  <span className="field-label">
                    课件名称 <em>*</em>
                  </span>
                  <input
                    className="field-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="如：洋流分布示意图"
                    autoFocus
                  />
                </label>

                <div className="field-row">
                  <label className="field">
                    <span className="field-label">作者</span>
                    <input
                      className="field-input"
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      placeholder="你的名字"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">学科</span>
                    <input
                      className="field-input"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </label>
                  <label className="field narrow">
                    <span className="field-label">版本</span>
                    <input
                      className="field-input"
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                    />
                  </label>
                </div>

                <label className="field">
                  <span className="field-label">标签（逗号分隔，用于筛选）</span>
                  <input
                    className="field-input"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="如：高中, 必修一, 洋流"
                  />
                </label>
              </>
            )}

            {error && <p className="modal-error">{error}</p>}

            <div className="modal-actions">
              <button className="btn" onClick={onCancel} disabled={busy}>
                取消
              </button>
              {source && (
                <button className="btn primary" onClick={submit} disabled={busy}>
                  {busy ? '导入中…' : '生成并导入'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
