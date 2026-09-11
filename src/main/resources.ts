import { app, BrowserWindow, dialog, shell } from 'electron'
import { join, extname } from 'node:path'
import { mkdirSync, copyFileSync, existsSync, statSync, rmSync } from 'node:fs'
import type { ImportResult, ResourceRecord } from '../shared/types'
import { listResources, getResource, upsertResource, deleteResourceRecord } from './db'

function resourcesDir(): string {
  const dir = join(app.getPath('userData'), 'resources')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** 用户上传教学资料（教材 PDF、课标、网页文档等） */
export async function addResourceDialog(win: BrowserWindow): Promise<ImportResult> {
  const result = await dialog.showOpenDialog(win, {
    title: '上传教学资料',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '教学资料', extensions: ['pdf', 'html', 'htm', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'md'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return { ok: false, message: '已取消' }

  let last: ResourceRecord | undefined
  for (const src of result.filePaths) {
    const filename = src.split(/[\\/]/).pop()!
    const id = `res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const dest = join(resourcesDir(), `${id}-${filename}`)
    copyFileSync(src, dest)
    const ext = extname(filename).toLowerCase()
    const rec: ResourceRecord = {
      id,
      title: filename.replace(/\.[^.]+$/, ''),
      kind: ext === '.pdf' ? '教材' : '其他',
      filename,
      path: dest,
      builtin: false,
      size: statSync(dest).size,
      createdAt: Date.now()
    }
    upsertResource(rec)
    last = rec
  }
  return {
    ok: true,
    message: `已上传 ${result.filePaths.length} 份资料`,
    record: undefined
  }
}

let docWin: BrowserWindow | null = null

/** 打开资料：HTML 用应用内阅读窗口，其余交给系统默认程序 */
export async function openResource(id: string): Promise<ImportResult> {
  const rec = getResource(id)
  if (!rec) return { ok: false, message: '资料不存在' }
  if (!existsSync(rec.path)) return { ok: false, message: '文件已丢失，请重新上传' }
  const ext = extname(rec.filename).toLowerCase()
  if (ext === '.html' || ext === '.htm') {
    if (docWin && !docWin.isDestroyed()) docWin.close()
    docWin = new BrowserWindow({
      width: 960,
      height: 760,
      autoHideMenuBar: true,
      backgroundColor: '#faf8f4',
      title: rec.title,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
    })
    docWin.on('closed', () => (docWin = null))
    await docWin.loadFile(rec.path)
    return { ok: true, message: `已打开「${rec.title}」` }
  }
  const err = await shell.openPath(rec.path)
  return err ? { ok: false, message: `打开失败：${err}` } : { ok: true, message: `已打开「${rec.title}」` }
}

/** 删除资料（预置资料不可删除） */
export function removeResource(id: string): ImportResult {
  const rec = getResource(id)
  if (!rec) return { ok: false, message: '资料不存在' }
  if (rec.builtin) return { ok: false, message: '预置资料不可删除' }
  rmSync(rec.path, { force: true })
  deleteResourceRecord(id)
  return { ok: true, message: `已删除「${rec.title}」` }
}

export { listResources }
