import { contextBridge, ipcRenderer } from 'electron'

/**
 * 课件运行时桥接 API：window.geobox
 * 用户 vibe coding 的课件可直接调用；不调用也能作为普通网页运行。
 */
contextBridge.exposeInMainWorld('geobox', {
  platform: 'geobox',
  /** 调起系统对话框导入文件（如 DEM/GeoJSON），返回 { name, path, data:ArrayBuffer } 或 null */
  importFile: (opts?: { accept?: string[] }) => ipcRenderer.invoke('player:importFile', opts),
  storage: {
    get: (key: string) => ipcRenderer.invoke('player:storageGet', key),
    set: (key: string, value: string) => ipcRenderer.invoke('player:storageSet', key, value)
  },
  setFullscreen: (flag: boolean) => ipcRenderer.invoke('player:setFullscreen', flag),
  exit: () => ipcRenderer.invoke('player:exit'),
  version: () => ipcRenderer.invoke('player:version')
})
