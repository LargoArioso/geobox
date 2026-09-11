import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, copyFileSync } from 'node:fs'
import type { PackageManifest, ResourceRecord } from '../shared/types'
import { importFromFolder, packagesDir } from './packages'
import { getPackage, kvGet, kvSet, upsertResource, listResources } from './db'

/**
 * 内置内容（预置课件 + 预置教学资料）的定位与播种。
 * 开发环境读取项目根目录下的 courseware/ 与 resources/；
 * 打包后读取 process.resourcesPath 下同名目录（electron-builder extraResources）。
 */
function contentRoot(name: 'courseware' | 'resources'): string | null {
  const candidates = [
    join(app.getAppPath(), name),
    process.resourcesPath ? join(process.resourcesPath, name) : ''
  ]
  for (const c of candidates) {
    if (c && existsSync(c)) return c
  }
  return null
}

/** 播种预置课件：版本变化或本地缺失时重新导入，source 标记为 builtin */
export function seedBuiltinCourseware(): void {
  const root = contentRoot('courseware')
  if (!root) return
  for (const name of readdirSync(root)) {
    const dir = join(root, name)
    const manifestPath = join(dir, 'manifest.json')
    if (!statSync(dir).isDirectory() || !existsSync(manifestPath)) continue
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as PackageManifest
      if (!manifest.id) continue
      const version = manifest.version ?? '1.0.0'
      const seedKey = `builtin-seed:${manifest.id}`
      const existing = getPackage(manifest.id)
      const destExists = existsSync(join(packagesDir(), manifest.id))
      // 已播种过同版本且文件还在 → 跳过
      if (existing && destExists && kvGet('__builtin__', seedKey) === version) continue
      const result = importFromFolder(dir, 'builtin')
      if (result.ok) kvSet('__builtin__', seedKey, version)
      console.log(`[builtin] 课件「${manifest.name}」: ${result.message}`)
    } catch (e) {
      console.warn(`[builtin] 播种失败 ${name}:`, e)
    }
  }
}

/** 播种预置教学资料（课标要点等 HTML 文档） */
export function seedBuiltinResources(): void {
  const root = contentRoot('resources')
  if (!root) return
  const destRoot = join(app.getPath('userData'), 'resources')
  mkdirSync(destRoot, { recursive: true })
  const existing = new Set(listResources().map((r) => r.id))

  for (const filename of readdirSync(root)) {
    const src = join(root, filename)
    if (!statSync(src).isFile() || !filename.endsWith('.html')) continue
    const id = `builtin-res-${filename}`
    const dest = join(destRoot, filename)
    // 标题与分类从文件首行注释读取：<!-- title: xxx | kind: 课程标准 -->
    const head = readFileSync(src, 'utf-8').slice(0, 500)
    const m = /<!--\s*title:\s*(.+?)\s*\|\s*kind:\s*(.+?)\s*-->/.exec(head)
    const title = m?.[1] ?? filename.replace(/\.html$/, '')
    const kind = m?.[2] ?? '课程标准'
    // 已存在且文件还在 → 跳过（允许用户删除后不再复活）
    if (existing.has(id) && existsSync(dest)) continue
    if (existing.has(id) && !existsSync(dest)) continue // 用户主动删除过，不复活
    copyFileSync(src, dest)
    const rec: ResourceRecord = {
      id,
      title,
      kind,
      filename,
      path: dest,
      builtin: true,
      size: statSync(dest).size,
      createdAt: Date.now()
    }
    upsertResource(rec)
    console.log(`[builtin] 资料「${title}」已播种`)
  }
}
