import { contextBridge, ipcRenderer } from 'electron'

/** 课件库窗口使用的 API：window.geoboxLib */
contextBridge.exposeInMainWorld('geoboxLib', {
  list: () => ipcRenderer.invoke('pkg:list'),
  importPath: (p: string) => ipcRenderer.invoke('pkg:importPath', p),
  pickImportFile: () => ipcRenderer.invoke('pkg:pickImportFile'),
  pickImportFolder: () => ipcRenderer.invoke('pkg:pickImportFolder'),
  importWeb: (payload: unknown) => ipcRenderer.invoke('pkg:importWeb', payload),
  exportPackage: (id: string) => ipcRenderer.invoke('pkg:export', id),
  deletePackage: (id: string) => ipcRenderer.invoke('pkg:delete', id),
  openPackage: (id: string) => ipcRenderer.invoke('pkg:open', id),
  onImported: (cb: (result: unknown) => void) => {
    ipcRenderer.on('pkg:imported', (_e, result) => cb(result))
  },
  // 教学资料
  listResources: () => ipcRenderer.invoke('res:list'),
  addResources: () => ipcRenderer.invoke('res:addDialog'),
  openResource: (id: string) => ipcRenderer.invoke('res:open', id),
  deleteResource: (id: string) => ipcRenderer.invoke('res:delete', id)
})
