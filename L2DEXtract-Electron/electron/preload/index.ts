import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface ExtractResult {
  outputDir: string
  characterDirs: string[]
}

export interface LoadModelResult {
  modelUrl: string
}

const api = {
  getPathForFile(file: File) {
    return webUtils.getPathForFile(file)
  },
  selectLpk: () => ipcRenderer.invoke('dialog:select-lpk') as Promise<string | null>,
  selectConfig: () => ipcRenderer.invoke('dialog:select-config') as Promise<string | null>,
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory') as Promise<string | null>,
  suggestConfig: (lpkPath: string) =>
    ipcRenderer.invoke('extract:suggest-config', lpkPath) as Promise<string | null>,
  defaultOutput: () => ipcRenderer.invoke('app:default-output') as Promise<string>,
  extract: (payload: { lpkPath: string; configPath: string; outputDir: string }) =>
    ipcRenderer.invoke('extract:start', payload) as Promise<ExtractResult>,
  onExtractLog(handler: (line: string) => void) {
    const listener = (_event: unknown, line: string) => handler(line)
    ipcRenderer.on('extract:log', listener)
    return () => ipcRenderer.removeListener('extract:log', listener)
  },
  onNeedFileId(handler: (respond: (fileId: string) => void) => void) {
    const listener = (_event: unknown, requestId: string) => {
      handler((fileId) => {
        ipcRenderer.send('extract:file-id', requestId, fileId)
      })
    }
    ipcRenderer.on('extract:need-file-id', listener)
    return () => ipcRenderer.removeListener('extract:need-file-id', listener)
  },
  openPath: (target: string) => ipcRenderer.invoke('shell:open-path', target) as Promise<void>,
  startPreview: () => ipcRenderer.invoke('preview:start') as Promise<{ url: string }>,
  loadModel: (dir: string) => ipcRenderer.invoke('preview:load-model', dir) as Promise<LoadModelResult>,
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
}
