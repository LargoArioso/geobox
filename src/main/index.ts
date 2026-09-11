import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join, extname } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import { initDb, listPackages, listResources } from './db'
import { importFromFolder, importFromZip, exportPackage, removePackage } from './packages'
import { registerGpakScheme, handleGpakProtocol, openPlayer, registerPlayerIpc } from './player'
import { seedBuiltinCourseware, seedBuiltinResources } from './builtin'
import { addResourceDialog, openResource, removeResource } from './resources'
import type { ImportResult } from '../shared/types'

registerGpakScheme()

let libraryWin: BrowserWindow | null = null

function createLibraryWindow(): void {
  libraryWin = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    title: 'GeoBox 地理课件舱',
    webPreferences: {
      preload: join(__dirname, '../preload/library.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  libraryWin.on('closed', () => (libraryWin = null))

  if (process.env.ELECTRON_RENDERER_URL) {
    libraryWin.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    libraryWin.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** 命令行 / 双击 .gpak 文件唤起时的导入 */
async function importPath(p: string): Promise<ImportResult> {
  if (!existsSync(p)) return { ok: false, message: `路径不存在：${p}` }
  if (statSync(p).isDirectory()) return importFromFolder(p)
  const ext = extname(p).toLowerCase()
  if (ext === '.gpak' || ext === '.zip') return importFromZip(p)
  return { ok: false, message: '仅支持 .gpak / .zip 文件或文件夹' }
}

function registerLibraryIpc(): void {
  ipcMain.handle('pkg:list', () => listPackages())

  ipcMain.handle('pkg:importDialog', async () => {
    if (!libraryWin) return { ok: false, message: '窗口不可用' }
    const result = await dialog.showOpenDialog(libraryWin, {
      title: '导入课件包',
      properties: ['openFile'],
      filters: [{ name: 'GeoBox 课件包', extensions: ['gpak', 'zip'] }]
    })
    if (result.canceled || !result.filePaths[0]) return { ok: false, message: '已取消' }
    return importPath(result.filePaths[0])
  })

  ipcMain.handle('pkg:importFolderDialog', async () => {
    if (!libraryWin) return { ok: false, message: '窗口不可用' }
    const result = await dialog.showOpenDialog(libraryWin, {
      title: '从文件夹导入课件',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return { ok: false, message: '已取消' }
    return importPath(result.filePaths[0])
  })

  ipcMain.handle('pkg:importPath', (_e, p: string) => importPath(p))

  ipcMain.handle('pkg:export', async (_e, id: string) => {
    if (!libraryWin) return { ok: false, message: '窗口不可用' }
    const rec = listPackages().find((r) => r.id === id)
    if (!rec) return { ok: false, message: '课件不存在' }
    const result = await dialog.showSaveDialog(libraryWin, {
      title: '导出课件包',
      defaultPath: `${rec.name}.gpak`,
      filters: [{ name: 'GeoBox 课件包', extensions: ['gpak'] }]
    })
    if (result.canceled || !result.filePath) return { ok: false, message: '已取消' }
    return exportPackage(id, result.filePath)
  })

  ipcMain.handle('pkg:delete', (_e, id: string) => removePackage(id))
  ipcMain.handle('pkg:open', (_e, id: string) => openPlayer(id))

  // ---------- 教学资料 ----------
  ipcMain.handle('res:list', () => listResources())
  ipcMain.handle('res:addDialog', async () => {
    if (!libraryWin) return { ok: false, message: '窗口不可用' }
    return addResourceDialog(libraryWin)
  })
  ipcMain.handle('res:open', (_e, id: string) => openResource(id))
  ipcMain.handle('res:delete', (_e, id: string) => removeResource(id))
}

// 单实例：双击 .gpak 时把文件交给已运行的实例
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const target = argv.find((a) => a.toLowerCase().endsWith('.gpak'))
    if (target) {
      importPath(target).then((r) => libraryWin?.webContents.send('pkg:imported', r))
    }
    if (libraryWin) {
      if (libraryWin.isMinimized()) libraryWin.restore()
      libraryWin.focus()
    }
  })

  app.whenReady().then(() => {
    initDb()
    seedBuiltinCourseware()
    seedBuiltinResources()
    handleGpakProtocol()
    registerLibraryIpc()
    registerPlayerIpc()
    createLibraryWindow()

    // 安装后双击 .gpak 冷启动
    const target = process.argv.find((a) => a.toLowerCase().endsWith('.gpak'))
    if (target) {
      importPath(target).then((r) => libraryWin?.webContents.send('pkg:imported', r))
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createLibraryWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
