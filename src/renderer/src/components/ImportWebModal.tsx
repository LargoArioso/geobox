import { useState } from 'react'
import type { ImportResult, WebImportPayload, WebImportPrepare } from '../../../shared/types'
import { api } from '../api'

interface Props {
  prepare: WebImportPrepare
  onCancel: () => void
  onDone: (result: ImportResult) => void
}

/** 导入网页课件的信息表单：自动生成 manifest.json，免去手写 */
export default function ImportWebModal({ prepare, onCancel, onDone }: Props): JSX.Element {
  const [name, setName] = useState(prepare.suggestedName ?? '')
  const [author, setAuthor] = useState('')
  const [subject, setSubject] = useState('地理')
  const [tags, setTags] = useState('')
  const [version, setVersion] = useState('1.0.0')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('请填写课件名称')
      return
    }
    setBusy(true)
    const payload: WebImportPayload = {
      rootDir: prepare.rootDir!,
      entry: prepare.entry!,
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
          <span className="modal-kicker">IMPORT WEB PAGE</span>
          <h3 className="modal-title">补充课件信息</h3>
          <p className="modal-sub">
            将自动生成 <code>manifest.json</code> 并打包导入，无需手动编辑任何文件。
          </p>
        </div>

        <div className="modal-path">
          <span className="modal-path-label">课件目录</span>
          <span className="modal-path-value">{prepare.rootDir}</span>
          <span className="modal-path-hint">
            入口 {prepare.entry} · 目录内图片等素材将一并导入
            {prepare.hasManifest ? ' · 检测到已有 manifest，将按其 id 覆盖更新' : ''}
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

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button className="btn" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? '导入中…' : '生成并导入'}
          </button>
        </div>
      </div>
    </div>
  )
}
