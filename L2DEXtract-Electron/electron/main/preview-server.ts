import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const mounts = new Map<string, string>()

let previewUrl = ''
let starting: Promise<string> | null = null

export function getPreviewUrl(): string {
  return previewUrl
}

export function startPreviewServer(): Promise<string> {
  if (previewUrl) return Promise.resolve(previewUrl)
  if (!starting) {
    starting = openPreviewServer().catch((error: unknown) => {
      starting = null
      throw error
    })
  }
  return starting
}

function openPreviewServer(): Promise<string> {
  const server = http.createServer((req, res) => {
    void handleRequest(req, res)
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      previewUrl = `http://127.0.0.1:${port}`
      resolve(previewUrl)
    })
  })
}

export function mountModelDir(dirPath: string): string {
  const resolved = path.resolve(dirPath)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`模型目录不存在：${dirPath}`)
  }
  for (const [id, mounted] of mounts) {
    if (mounted === resolved) return `/model/${id}`
  }
  const id = randomBytes(4).toString('hex')
  mounts.set(id, resolved)
  return `/model/${id}`
}

export interface ListedModel {
  name: string
  dir: string
  file: string
}

const MAX_MODEL_DEPTH = 6
const MAX_MODELS = 200
const MAX_DIRS = 400

export function loadPreviewModel(dirPath: string, fileName?: string): { modelUrl: string } {
  if (!previewUrl) throw new Error('预览服务还没启动')
  const dir = path.resolve(dirPath)
  const modelJson = fileName ? resolveModelFile(dir, fileName) : findModelJson(dir)
  if (!modelJson) throw new Error('没有找到可用的模型 JSON')
  const basePath = mountModelDir(dir)
  const modelUrl = `${previewUrl}${basePath}/${encodeURIComponent(path.basename(modelJson))}`
  return { modelUrl }
}

export function listModels(rootPath: string): ListedModel[] {
  const root = path.resolve(rootPath)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`目录不存在：${rootPath}`)
  }
  const found: ListedModel[] = []
  let dirs = 0
  const visit = (dir: string, depth: number) => {
    if (found.length >= MAX_MODELS || dirs >= MAX_DIRS) return
    dirs += 1
    const files = listModelFiles(dir)
    const rel = path.relative(root, dir).replaceAll('\\', '/')
    for (const file of files) {
      if (found.length >= MAX_MODELS) return
      const stem = file.replace(/\.json$/i, '')
      const name = !rel ? stem : files.length === 1 ? rel : `${rel} / ${stem}`
      found.push({ name, dir, file })
    }
    if (depth >= MAX_MODEL_DEPTH) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      visit(path.join(dir, entry.name), depth + 1)
    }
  }
  visit(root, 0)
  return found
}

export function findModelJson(folder: string): string | null {
  const file = listModelFiles(folder)[0]
  return file ? path.join(folder, file) : null
}

function listModelFiles(folder: string): string[] {
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) return []
  let names: string[]
  try {
    names = fs.readdirSync(folder)
  } catch {
    return []
  }
  const groups = [
    names.filter((file) => file.endsWith('.model3.json')),
    names.filter((file) => file.endsWith('.model.json')),
    names.filter((file) => file.toLowerCase().includes('model') && file.endsWith('.json')),
    names.filter((file) => file.endsWith('.json')),
  ]
  const seen = new Set<string>()
  const found: string[] = []
  for (const group of groups) {
    for (const file of group) {
      if (seen.has(file)) continue
      seen.add(file)
      const full = path.join(folder, file)
      try {
        if (fs.statSync(full).isFile() && isModelJson(full)) found.push(file)
      } catch {
        continue
      }
    }
  }
  return found
}

function resolveModelFile(dir: string, fileName: string): string | null {
  const base = path.basename(fileName)
  if (!base || base !== fileName.replaceAll('\\', '/').split('/').pop()) return null
  const full = path.join(dir, base)
  if (!fs.existsSync(full) || !fs.statSync(full).isFile() || !isModelJson(full)) return null
  return full
}

function isModelJson(file: string): boolean {
  if (path.basename(file) === 'model0.json') return true
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    if (!isRecord(data)) return false
    const refs = data.FileReferences
    if (isRecord(refs) && typeof refs.Moc === 'string') return true
    return typeof data.model === 'string' && Array.isArray(data.textures)
  } catch {
    return false
  }
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.method === 'OPTIONS') {
      writeHeaders(res, 204)
      res.end()
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      writeHeaders(res, 405)
      res.end()
      return
    }
    const modelMatch = url.pathname.match(/^\/model\/([^/]+)\/(.+)$/)
    if (modelMatch) {
      const root = mounts.get(decodeURIComponent(modelMatch[1]!))
      if (!root) {
        writeHeaders(res, 404)
        res.end()
        return
      }
      const file = resolveInside(root, modelMatch[2]!)
      sendFile(res, file, req.method === 'HEAD')
      return
    }
    writeHeaders(res, 404)
    res.end()
  } catch {
    if (!res.headersSent) writeHeaders(res, 400)
    res.end()
  }
}

function sendFile(res: http.ServerResponse, file: string | null, headOnly: boolean): void {
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    writeHeaders(res, 404)
    res.end()
    return
  }
  const stat = fs.statSync(file)
  res.writeHead(200, {
    'Content-Type': contentType(file),
    'Content-Length': stat.size,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  })
  if (headOnly) {
    res.end()
    return
  }
  fs.createReadStream(file).pipe(res)
}

function resolveInside(root: string, requestPath: string): string | null {
  let decoded = requestPath
  try {
    decoded = decodeURIComponent(requestPath)
  } catch {
    return null
  }
  const full = path.resolve(root, decoded)
  const relative = path.relative(path.resolve(root), full)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null
  return full
}

function writeHeaders(res: http.ServerResponse, status: number, type = 'text/plain; charset=utf-8'): void {
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
}

function contentType(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.json':
      return 'application/json; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    case '.wav':
      return 'audio/wav'
    case '.ogg':
      return 'audio/ogg'
    case '.mp3':
      return 'audio/mpeg'
    case '.moc3':
    case '.moc':
      return 'application/octet-stream'
    default:
      return 'application/octet-stream'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
