import { createHash } from 'node:crypto'

const ENCRYPTED_FILE = /[0-9a-f]{32}.bin3?/

export function isEncryptedFile(value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^(?:${ENCRYPTED_FILE.source})$`).test(value)
}

export function findEncryptedFile(value: string): string | null {
  const found = new RegExp(ENCRYPTED_FILE.source).exec(value)
  return found?.[0] ?? null
}

export function hashedFilename(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex')
}

export function pyStrip(value: string, chars: string): string {
  const set = new Set(chars)
  let start = 0
  let end = value.length
  while (start < end && set.has(value[start]!)) start++
  while (end > start && set.has(value[end - 1]!)) end--
  return value.slice(start, end)
}

export function normalizeName(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 32) out += ch
  }
  out = out.replace(/[\\/<>:"|?*]/g, '')
  if (!out.trim()) return 'unnamed'
  return out
}

export function genkey(value: string): bigint {
  let ret = 0n
  for (const ch of value) {
    ret = (ret * 31n + BigInt(ch.codePointAt(0) ?? 0)) & 0xffffffffn
  }
  if (ret & 0x80000000n) {
    ret = ret | 0xffffffff00000000n
  }
  return ret
}

export function decrypt(key: bigint, data: Buffer): Buffer {
  const ret = Buffer.alloc(data.length)
  let out = 0
  for (let offset = 0; offset < data.length; offset += 1024) {
    const end = Math.min(offset + 1024, data.length)
    let tmpkey = key
    for (let i = offset; i < end; i++) {
      tmpkey = (65535n & ((2531011n + 214013n * tmpkey) >> 16n)) & 0xffffffffn
      ret[out++] = Number(tmpkey & 0xffn) ^ data[i]!
    }
  }
  return ret
}

export function* travels(value: unknown): Generator<[string, unknown]> {
  if (isRecord(value)) {
    yield* travelsDict(value)
    return
  }
  if (Array.isArray(value)) yield* travelsList(value)
}

function* travelsDict(dic: Record<string, unknown>): Generator<[string, unknown]> {
  for (const key of Object.keys(dic)) {
    const item = dic[key]
    if (isRecord(item)) {
      for (const [child, childValue] of travelsDict(item)) yield [`${key}_${child}`, childValue]
    } else if (Array.isArray(item)) {
      for (const [child, childValue] of travelsList(item)) yield [`${key}_${child}`, childValue]
    } else {
      yield [key, item]
    }
  }
}

function* travelsList(values: unknown[]): Generator<[string, unknown]> {
  for (let i = 0; i < values.length; i++) {
    const item = values[i]
    if (isRecord(item)) {
      for (const [child, childValue] of travelsDict(item)) yield [`${i}_${child}`, childValue]
    } else if (Array.isArray(item)) {
      for (const [child, childValue] of travelsList(item)) yield [`${i}_${child}`, childValue]
    } else {
      yield [String(i), item]
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function guessType(data: Buffer): string {
  if (data.length > 3 && data.subarray(0, 4).toString('latin1') === 'MOC3') return '.moc3'
  if (data.length > 3 && data.subarray(0, 3).toString('latin1') === 'moc') return '.moc'
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return '.png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return '.jpg'
  if (data.length >= 6) {
    const gif = data.subarray(0, 6).toString('latin1')
    if (gif === 'GIF87a' || gif === 'GIF89a') return '.gif'
  }
  if (data.length >= 12 && data.subarray(0, 4).toString('latin1') === 'RIFF') {
    const kind = data.subarray(8, 12).toString('latin1')
    if (kind === 'WEBP') return '.webp'
    if (kind === 'WAVE') return '.wav'
  }
  if (data.length >= 4 && data.subarray(0, 4).toString('latin1') === 'OggS') return '.ogg'
  if (data.length >= 3 && data.subarray(0, 3).toString('latin1') === 'ID3') return '.mp3'
  if (data.length >= 2 && data[0] === 0xff && (data[1]! & 0xe0) === 0xe0) return '.mp3'
  try {
    JSON.parse(data.toString('utf8'))
    return '.json'
  } catch {
    return ''
  }
}
