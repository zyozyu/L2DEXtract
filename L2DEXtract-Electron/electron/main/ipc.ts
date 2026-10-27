import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { extractLpk } from './lpk/loader.ts'
import { listModels, loadPreviewModel, startPreviewServer } from './preview-server.ts'

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

  ipcMain.handle('preview:list-models', (_event, dirPath: string) => {
    return listModels(dirPath)
  })

  ipcMain.handle('preview:load-model', (_event, dirPath: string, fileName?: string) => {
    return loadPreviewModel(dirPath, fileName)
  })

  ipcMain.handle('preview:delete-model', (_event, dirPath: string) => {
    const dir = path.resolve(dirPath || '')
    assertModelDir(dir)
    fs.rmSync(dir, { recursive: true, force: false })
  })

  ipcMain.handle('preview:save-model-as', async (event, dirPath: string) => {
    const dir = path.resolve(dirPath || '')
    assertModelDir(dir)
    const win = BrowserWindow.fromWebContents(event.sender) ?? getWindow()
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      title: '另存为',
      defaultPath: dir,
      buttonLabel: '保存',
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })
    if (result.canceled || !result.filePath) return null
    const dest = path.resolve(result.filePath)
    if (samePath(dest, dir)) throw new Error('不能保存到原来的位置')
    if (isInside(dir, dest)) throw new Error('不能保存到模型目录里面')
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
    fs.cpSync(dir, dest, { recursive: true })
    return dest
  })
}

function assertModelDir(dir: string): void {
  const root = path.parse(dir).root
  if (!dir || samePath(dir, root)) throw new Error('不能操作这个目录')
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('模型目录不存在')
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
}

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child))
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function requestFileId(win: BrowserWindow | null): Promise<string> {
  if (!win || win.isDestroyed()) return Promise.reject(new Error('窗口不可用'))
  const requestId = randomBytes(8).toString('hex')
  return new Promise((resolve) => {
    pendingFileIds.set(requestId, resolve)
    win.webContents.send('extract:need-file-id', requestId)
  })
}
