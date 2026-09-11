import { BrowserWindow, dialog, ipcMain, net, protocol, app } from 'electron'
import { join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import { packagesDir } from './packages'
import { getPackage, kvGet, kvSet } from './db'

/** 记录每个播放器窗口对应的课件 id */
const playerWindows = new Map<number, string>()

/** 必须在 app ready 之前调用 */
export function registerGpakScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'gpak',
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

/** app ready 之后调用：gpak://pkg/<id>/<path> -> userData/packages/<id>/<path> */
export function handleGpakProtocol(): void {
  protocol.handle('gpak', (request) => {
    const url = new URL(request.url)
    // host 固定为 pkg，课件 id 是路径第一段（host 会被 URL 规范化，不能用来承载 id）
    const segs = decodeURIComponent(url.pathname).replace(/^\/+/, '').split('/')
    const id = segs.shift() ?? ''
    const rel = segs.join('/') || 'index.html'
    const filePath = normalize(join(packagesDir(), id, rel))
    // 防目录穿越
    if (!filePath.startsWith(normalize(packagesDir()))) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

/** 打开课件播放器窗口（全屏、沙箱、触控友好） */
export function openPlayer(packageId: string): boolean {
  const rec = getPackage(packageId)
  if (!rec) return false
  const entryPath = join(rec.dir, rec.entry ?? 'index.html')
  if (!existsSync(entryPath)) return false

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    title: `${rec.name} - GeoBox`,
    webPreferences: {
      preload: join(__dirname, '../preload/player.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  playerWindows.set(win.webContents.id, packageId)
  win.on('closed', () => playerWindows.delete(win.webContents.id))
  win.maximize()
  win.loadURL(`gpak://pkg/${packageId}/${rec.entry ?? 'index.html'}`)
  return true
}

function packageIdOf(sender: Electron.WebContents): string | undefined {
  return playerWindows.get(sender.id)
}

/** 播放器桥接 API 的 IPC 实现 */
export function registerPlayerIpc(): void {
  // 课件内导入真实数据文件（DEM/GeoJSON 等）
  ipcMain.handle('player:importFile', async (event, opts: { accept?: string[] }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const filters = opts?.accept?.length
      ? [{ name: '地理数据', extensions: opts.accept.map((e) => e.replace(/^\./, '')) }]
      : [{ name: '所有文件', extensions: ['*'] }]
    const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters })
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]
    const buf = readFileSync(filePath)
    return {
      name: join(filePath).split(/[\\/]/).pop(),
      path: filePath,
      data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    }
  })

  // 课件级持久化存储
  ipcMain.handle('player:storageGet', (event, key: string) => {
    const id = packageIdOf(event.sender)
    return id ? kvGet(id, key) : null
  })
  ipcMain.handle('player:storageSet', (event, key: string, value: string) => {
    const id = packageIdOf(event.sender)
    if (id) kvSet(id, key, value)
  })

  // 窗口控制
  ipcMain.handle('player:setFullscreen', (event, flag: boolean) => {
    BrowserWindow.fromWebContents(event.sender)?.setFullScreen(!!flag)
  })
  ipcMain.handle('player:exit', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle('player:version', () => app.getVersion())
}
