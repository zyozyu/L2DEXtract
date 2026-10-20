import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { WebSocket, WebSocketServer } from 'ws'

const clients = new Set<WebSocket>()
const mounts = new Map<string, string>()

let previewUrl = ''
let starting: Promise<string> | null = null

export function previewPageUrl(): string {
  return previewUrl ? `${previewUrl}/static/live2d/web.html?lang=zh` : ''
}

export function startPreviewServer(assetsDir: string): Promise<string> {
  if (previewUrl) return Promise.resolve(previewUrl)
  if (!starting) {
    starting = openPreviewServer(assetsDir).catch((error: unknown) => {
      starting = null
      throw error
    })
  }
  return starting
}

function openPreviewServer(assetsDir: string): Promise<string> {
  const server = http.createServer((req, res) => {
    void handleRequest(req, res, assetsDir)
  })
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    if (pathname !== '/ws/preview') {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws)
      ws.on('close', () => clients.delete(ws))
      ws.on('error', () => clients.delete(ws))
    })
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

export function broadcastPreview(message: unknown): number {
  const text = JSON.stringify(message)
  let count = 0
  for (const ws of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue
    ws.send(text)
    count++
  }
  return count
}

export function loadPreviewModel(dirPath: string): { modelUrl: string; clients: number } {
  if (!previewUrl) throw new Error('预览服务还没启动')
  const modelJson = findModelJson(dirPath)
  if (!modelJson) throw new Error('没有找到可用的模型 JSON')
  const basePath = mountModelDir(dirPath)
  const modelUrl = `${previewUrl}${basePath}/${encodeURIComponent(path.basename(modelJson))}`
  const clientsCount = broadcastPreview({
    type: 'loadModel',
    modelUrl,
    modelPath: modelUrl,
  })
  return { modelUrl, clients: clientsCount }
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

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  assetsDir: string,
): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.method === 'OPTIONS') {
      writeHeaders(res, 204)
      res.end()
      return
    }
    if (url.pathname === '/favicon.ico') {
      writeHeaders(res, 404)
      res.end()
      return
    }
    if (url.pathname === '/') {
      res.writeHead(302, { Location: '/static/live2d/web.html' })
      res.end()
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/preview/broadcast') {
      const payload = await readJson(req)
      const count = broadcastPreview(payload)
      writeHeaders(res, 200, 'application/json; charset=utf-8')
      res.end(JSON.stringify({ ok: true, clients: count }))
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      writeHeaders(res, 405)
      res.end()
      return
    }
    if (url.pathname.startsWith('/static/')) {
      const file = resolveInside(assetsDir, url.pathname.slice('/static/'.length))
      sendFile(res, file, req.method === 'HEAD')
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
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
}

function contentType(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
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
    default:
      return 'application/octet-stream'
  }
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buf.length
    if (size > 1_000_000) throw new Error('body too large')
    chunks.push(buf)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return {}
  return JSON.parse(text) as unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
