/** 课件包 manifest.json 的结构 */
export interface PackageManifest {
  id: string
  name: string
  author?: string
  version?: string
  subject?: string
  tags?: string[]
  entry?: string
  permissions?: string[]
}

/** 课件库中的一条课件记录 */
export interface PackageRecord extends PackageManifest {
  source: 'builtin' | 'user'
  dir: string
  createdAt: number
  updatedAt: number
}

/** 导入结果 */
export interface ImportResult {
  ok: boolean
  message: string
  record?: PackageRecord
}

/** 教学资料（课标 / 教材 / 其他文档）记录 */
export interface ResourceRecord {
  id: string
  title: string
  kind: string // 课程标准 | 教材 | 其他
  filename: string
  path: string
  builtin: boolean
  size: number
  createdAt: number
}
