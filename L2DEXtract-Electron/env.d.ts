/// <reference types="vite/client" />

interface ExtractResult {
  outputDir: string
  characterDirs: string[]
}

interface LoadModelResult {
  modelUrl: string
}

interface ListedModel {
  name: string
  dir: string
  file: string
}

interface ElectronApi {
  getPathForFile: (file: File) => string
  selectLpk: () => Promise<string | null>
  selectConfig: () => Promise<string | null>
  selectDirectory: () => Promise<string | null>
  suggestConfig: (lpkPath: string) => Promise<string | null>
  defaultOutput: () => Promise<string>
  extract: (payload: { lpkPath: string; configPath: string; outputDir: string }) => Promise<ExtractResult>
  onExtractLog: (handler: (line: string) => void) => () => void
  onNeedFileId: (handler: (respond: (fileId: string) => void) => void) => () => void
  openPath: (target: string) => Promise<void>
  startPreview: () => Promise<{ url: string }>
  listModels: (dir: string) => Promise<ListedModel[]>
  loadModel: (dir: string, file?: string) => Promise<LoadModelResult>
  deleteModel: (dir: string) => Promise<void>
  saveModelAs: (dir: string) => Promise<string | null>
}

interface Window {
  api: ElectronApi
}
