import { contextBridge, ipcRenderer } from 'electron'

/** 课件库窗口使用的 API：window.geoboxLib */
contextBridge.exposeInMainWorld('geoboxLib', {
  list: () => ipcRenderer.invoke('pkg:list'),
  importDialog: () => ipcRenderer.invoke('pkg:importDialog'),
  importFolderDialog: () => ipcRenderer.invoke('pkg:importFolderDialog'),
  importPath: (p: string) => ipcRenderer.invoke('pkg:importPath', p),
  exportPackage: (id: string) => ipcRenderer.invoke('pkg:export', id),
  deletePackage: (id: string) => ipcRenderer.invoke('pkg:delete', id),
  openPackage: (id: string) => ipcRenderer.invoke('pkg:open', id),
  onImported: (cb: (result: unknown) => void) => {
    ipcRenderer.on('pkg:imported', (_e, result) => cb(result))
  }
})
