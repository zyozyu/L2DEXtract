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

export function loadPreviewModel(dirPath: string): { modelUrl: string } {
  if (!previewUrl) throw new Error('预览服务还没启动')
  const modelJson = findModelJson(dirPath)
  if (!modelJson) throw new Error('没有找到可用的模型 JSON')
  const basePath = mountModelDir(dirPath)
  const modelUrl = `${previewUrl}${basePath}/${encodeURIComponent(path.basename(modelJson))}`
  return { modelUrl }
}

export function findModelJson(folder: string): string | null {
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) return null
  const files = fs.readdirSync(folder)
  const groups = [
    files.filter((file) => file.endsWith('.model3.json')),
    files.filter((file) => file.endsWith('.model.json')),
    files.filter((file) => file.toLowerCase().includes('model') && file.endsWith('.json')),
    files.filter((file) => file.endsWith('.json')),
  ]
  const seen = new Set<string>()
  for (const group of groups) {
    for (const file of group) {
      if (seen.has(file)) continue
      seen.add(file)
      const full = path.join(folder, file)
      if (fs.statSync(full).isFile() && isModelJson(full)) return full
    }
  }
  return null
}

function isModelJson(file: string): boolean {
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
