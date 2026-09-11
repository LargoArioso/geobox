import type { ImportResult, PackageRecord } from '../../shared/types'

export interface GeoboxLibApi {
  list: () => Promise<PackageRecord[]>
  importDialog: () => Promise<ImportResult>
  importFolderDialog: () => Promise<ImportResult>
  importPath: (p: string) => Promise<ImportResult>
  exportPackage: (id: string) => Promise<ImportResult>
  deletePackage: (id: string) => Promise<ImportResult>
  openPackage: (id: string) => Promise<boolean>
  onImported: (cb: (result: ImportResult) => void) => void
}

export const api = (window as any).geoboxLib as GeoboxLibApi
