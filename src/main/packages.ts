import { app } from 'electron'
import { join, basename } from 'node:path'
import { mkdirSync, existsSync, readFileSync, rmSync, copyFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import JSZip from 'jszip'
import type { ImportResult, PackageManifest, PackageRecord } from '../shared/types'
import { upsertPackage, deletePackageRecord, getPackage } from './db'

export function packagesDir(): string {
  const dir = join(app.getPath('userData'), 'packages')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 递归复制目录。
 * 注意：Electron 内嵌 Node 的 fs.cpSync 在 Windows 上对含非 ASCII 字符的目标路径
 * 会静默失败（不报错也不复制），而 userData 路径含产品名「GeoBox 地理课件舱」，
 * 因此必须逐文件复制（copyFileSync 无此问题）。
 */
function copyDirRecursive(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name)
    const d = join(dest, entry.name)
    if (entry.isDirectory()) copyDirRecursive(s, d)
    else copyFileSync(s, d)
  }
}

function readManifest(dir: string): PackageManifest {
  const manifestPath = join(dir, 'manifest.json')
  if (!existsSync(manifestPath)) {
    // 无 manifest：自动生成一个（方便直接导入普通网页项目）
    const name = basename(dir)
    const auto: PackageManifest = {
      id: `user-${Date.now().toString(36)}`,
      name,
      author: '',
      version: '1.0.0',
      subject: '地理',
      tags: [],
      entry: 'index.html',
      permissions: []
    }
    writeFileSync(manifestPath, JSON.stringify(auto, null, 2), 'utf-8')
    return auto
  }
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as PackageManifest
}

/** 从文件夹导入课件（自动生成缺失的 manifest） */
export function importFromFolder(srcDir: string, source: 'builtin' | 'user' = 'user'): ImportResult {
  try {
    const manifest = readManifest(srcDir)
    if (!manifest.id || !manifest.name) {
      return { ok: false, message: 'manifest.json 缺少 id 或 name 字段' }
    }
    const entry = manifest.entry ?? 'index.html'
    if (!existsSync(join(srcDir, entry))) {
      return { ok: false, message: `找不到入口文件 ${entry}` }
    }
    const destDir = join(packagesDir(), manifest.id)
    if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true })
    copyDirRecursive(srcDir, destDir)

    const now = Date.now()
    const existing = getPackage(manifest.id)
    const record: PackageRecord = {
      ...manifest,
      entry,
      source,
      dir: destDir,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    upsertPackage(record)
    return { ok: true, message: `已导入「${manifest.name}」`, record }
  } catch (e: any) {
    return { ok: false, message: `导入失败：${e?.message ?? e}` }
  }
}

/** 从 .gpak / .zip 文件导入 */
export async function importFromZip(zipPath: string): Promise<ImportResult> {
  try {
    const buf = readFileSync(zipPath)
    const zip = await JSZip.loadAsync(buf)
    const tmp = join(tmpdir(), `geobox-import-${Date.now()}`)
    mkdirSync(tmp, { recursive: true })

    // 若 zip 内只有一层顶层文件夹，则进入该层
    const entries = Object.values(zip.files)
    const roots = new Set(entries.map((f) => f.name.split('/')[0]))
    const strip = roots.size === 1 && entries.every((f) => f.name.includes('/')) ? `${[...roots][0]}/` : ''

    for (const file of entries) {
      if (file.dir) continue
      let rel = file.name
      if (strip && rel.startsWith(strip)) rel = rel.slice(strip.length)
      if (!rel) continue
      const dest = join(tmp, rel)
      mkdirSync(join(dest, '..'), { recursive: true })
      writeFileSync(dest, await file.async('nodebuffer'))
    }
    const result = importFromFolder(tmp)
    rmSync(tmp, { recursive: true, force: true })
    return result
  } catch (e: any) {
    return { ok: false, message: `解包失败：${e?.message ?? e}` }
  }
}

/** 导出课件为单个 .gpak 文件 */
export async function exportPackage(id: string, destPath: string): Promise<ImportResult> {
  try {
    const rec = getPackage(id)
    if (!rec) return { ok: false, message: '课件不存在' }
    const zip = new JSZip()
    const walk = (dir: string, prefix: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        const rel = prefix ? `${prefix}/${name}` : name
        if (statSync(full).isDirectory()) walk(full, rel)
        else zip.file(rel, readFileSync(full))
      }
    }
    walk(rec.dir, '')
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    writeFileSync(destPath, buf)
    return { ok: true, message: `已导出到 ${destPath}` }
  } catch (e: any) {
    return { ok: false, message: `导出失败：${e?.message ?? e}` }
  }
}

/** 删除课件（含磁盘文件与数据库记录）；预置课件不可删除 */
export function removePackage(id: string): ImportResult {
  try {
    const rec = getPackage(id)
    if (!rec) return { ok: false, message: '课件不存在' }
    if (rec.source === 'builtin') return { ok: false, message: '预置课件不可删除，可导出后另行修改' }
    rmSync(rec.dir, { recursive: true, force: true })
    deletePackageRecord(id)
    return { ok: true, message: `已删除「${rec.name}」` }
  } catch (e: any) {
    return { ok: false, message: `删除失败：${e?.message ?? e}` }
  }
}
