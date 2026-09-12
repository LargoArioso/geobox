import type {
  ImportResult,
  PackageRecord,
  PickSourceResult,
  ResourceRecord,
  WebImportPayload
} from '../../shared/types'

export interface GeoboxLibApi {
  list: () => Promise<PackageRecord[]>
  importPath: (p: string) => Promise<ImportResult>
  pickImportFile: () => Promise<PickSourceResult>
  pickImportFolder: () => Promise<PickSourceResult>
  importWeb: (payload: WebImportPayload) => Promise<ImportResult>
  exportPackage: (id: string) => Promise<ImportResult>
  deletePackage: (id: string) => Promise<ImportResult>
  openPackage: (id: string) => Promise<boolean>
  onImported: (cb: (result: ImportResult) => void) => void
  listResources: () => Promise<ResourceRecord[]>
  addResources: () => Promise<ImportResult>
  openResource: (id: string) => Promise<ImportResult>
  deleteResource: (id: string) => Promise<ImportResult>
}

export const api = (window as any).geoboxLib as GeoboxLibApi
