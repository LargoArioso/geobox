import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import type { PackageRecord } from '../shared/types'

let db: DatabaseSync

export function initDb(): void {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  db = new DatabaseSync(join(dir, 'geobox.db'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS packages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      author TEXT DEFAULT '',
      version TEXT DEFAULT '',
      subject TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      entry TEXT DEFAULT 'index.html',
      thumbnail TEXT DEFAULT '',
      source TEXT DEFAULT 'user',
      dir TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv (
      package_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (package_id, key)
    );
  `)
}

export function upsertPackage(rec: PackageRecord): void {
  db.prepare(
    `INSERT INTO packages (id, name, author, version, subject, tags, entry, thumbnail, source, dir, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, author=excluded.author, version=excluded.version,
       subject=excluded.subject, tags=excluded.tags, entry=excluded.entry,
       thumbnail=excluded.thumbnail, source=excluded.source, dir=excluded.dir,
       updated_at=excluded.updated_at`
  ).run(
    rec.id, rec.name, rec.author ?? '', rec.version ?? '', rec.subject ?? '',
    JSON.stringify(rec.tags ?? []), rec.entry ?? 'index.html', rec.thumbnail ?? '',
    rec.source, rec.dir, rec.createdAt, rec.updatedAt
  )
}

export function listPackages(): PackageRecord[] {
  const rows = db.prepare('SELECT * FROM packages ORDER BY updated_at DESC').all() as any[]
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    author: r.author,
    version: r.version,
    subject: r.subject,
    tags: JSON.parse(r.tags || '[]'),
    entry: r.entry,
    thumbnail: r.thumbnail,
    source: r.source,
    dir: r.dir,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }))
}

export function getPackage(id: string): PackageRecord | undefined {
  return listPackages().find((p) => p.id === id)
}

export function deletePackageRecord(id: string): void {
  db.prepare('DELETE FROM packages WHERE id = ?').run(id)
  db.prepare('DELETE FROM kv WHERE package_id = ?').run(id)
}

export function kvGet(packageId: string, key: string): string | null {
  const row = db.prepare('SELECT value FROM kv WHERE package_id = ? AND key = ?').get(packageId, key) as any
  return row ? row.value : null
}

export function kvSet(packageId: string, key: string, value: string): void {
  db.prepare(
    'INSERT INTO kv (package_id, key, value) VALUES (?, ?, ?) ON CONFLICT(package_id, key) DO UPDATE SET value=excluded.value'
  ).run(packageId, key, value)
}
