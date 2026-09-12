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
  /** 目标文件夹缺少 manifest.json 时携带待填信息，前端应弹出信息表单 */
  needManifest?: WebImportPrepare
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

/** 「导入网页课件」第一步：选中 html/文件夹后返回的待填信息 */
export interface WebImportPrepare {
  canceled: boolean
  rootDir?: string // 课件根目录（html 所在文件夹）
  entry?: string // 入口文件名（相对 rootDir）
  suggestedName?: string // 预填的课件名（文件夹名）
  hasManifest?: boolean // 目录里已有 manifest.json
}

/** 「导入网页课件」第二步：表单提交后自动生成 manifest 并导入 */
export interface WebImportPayload {
  rootDir: string
  entry: string
  name: string
  author?: string
  subject?: string
  tags?: string[]
  version?: string
}
