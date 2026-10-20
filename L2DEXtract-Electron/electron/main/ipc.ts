import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { extractLpk } from './lpk/loader.ts'
import { loadPreviewModel, startPreviewServer } from './preview-server.ts'

const pendingFileIds = new Map<string, (fileId: string) => void>()

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('dialog:select-lpk', async () => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: '选择 LPK',
      filters: [{ name: 'LPK', extensions: ['lpk'] }],
      properties: ['openFile'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('dialog:select-config', async () => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: '选择 config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('dialog:select-directory', async () => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: '选择目录',
      properties: ['openDirectory'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('extract:suggest-config', (_event, lpkPath: string) => {
    if (!lpkPath) return null
    const candidate = path.join(path.dirname(lpkPath), 'config.json')
    return fs.existsSync(candidate) ? candidate : null
  })

  ipcMain.handle('app:default-output', () => {
    const dir = path.join(app.getPath('documents'), 'L2DEXtract')
    fs.mkdirSync(dir, { recursive: true })
    return dir
  })

  ipcMain.handle('shell:open-path', async (_event, target: string) => {
    if (!target || !fs.existsSync(target)) throw new Error('路径不存在')
    const error = await shell.openPath(target)
    if (error) throw new Error(error)
  })

  ipcMain.on('extract:file-id', (_event, requestId: string, fileId: string) => {
    const resolve = pendingFileIds.get(requestId)
    if (!resolve) return
    pendingFileIds.delete(requestId)
    resolve(fileId ?? '')
  })

  ipcMain.handle(
    'extract:start',
    async (event, payload: { lpkPath: string; configPath?: string; outputDir: string }) => {
      const lpkPath = payload?.lpkPath ?? ''
      const outputDir = payload?.outputDir ?? ''
      if (!lpkPath || !fs.existsSync(lpkPath)) throw new Error('请选择有效的 LPK 文件')
      if (!outputDir) throw new Error('请选择输出目录')
      const sender = event.sender
      return extractLpk({
        lpkPath,
        configPath: payload.configPath ?? '',
        outputDir,
        log: (line) => {
          if (!sender.isDestroyed()) sender.send('extract:log', line)
        },
        tick: () => new Promise((resolve) => setImmediate(resolve)),
        askFileId: () => requestFileId(getWindow()),
      })
    },
  )

  ipcMain.handle('preview:start', async () => {
    const url = await startPreviewServer()
    return { url }
  })

  ipcMain.handle('preview:load-model', (_event, dirPath: string) => {
    return loadPreviewModel(dirPath)
  })
}

function requestFileId(win: BrowserWindow | null): Promise<string> {
  if (!win || win.isDestroyed()) return Promise.reject(new Error('窗口不可用'))
  const requestId = randomBytes(8).toString('hex')
  return new Promise((resolve) => {
    pendingFileIds.set(requestId, resolve)
    win.webContents.send('extract:need-file-id', requestId)
  })
}
