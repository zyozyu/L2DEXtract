import { TextureAtlas } from '@pixi-spine/base'
import { AtlasAttachmentLoader, SkeletonBinary, Spine } from '@pixi-spine/runtime-3.8'

export interface SpineMotionItem {
  key: string
  group: string
  index: number
  label: string
}

interface SpineAtlas {
  atlas?: string
  tex_names?: string[]
  textures?: string[]
}

interface SpineModel {
  skeleton?: string
  atlases?: SpineAtlas[]
  motions?: Record<string, { name?: string; file?: string }[]>
  hit_areas?: { name?: string }[]
}

type TextureLoader = (page: string, done: (texture: any) => void) => void

export function isSpineModel(data: unknown): data is SpineModel {
  if (!data || typeof data !== 'object') return false
  const model = data as SpineModel & { model?: unknown; textures?: unknown; FileReferences?: { Moc?: unknown } }
  if (typeof model.FileReferences?.Moc === 'string') return false
  if (typeof model.model === 'string' && Array.isArray(model.textures)) return false
  return typeof model.skeleton === 'string' && Array.isArray(model.atlases) && model.atlases.length > 0
}

export function spineMotionItems(data: unknown): SpineMotionItem[] {
  const motions = (data as SpineModel | null)?.motions
  if (!motions) return []
  const items: SpineMotionItem[] = []
  for (const group of Object.keys(motions)) {
    const list = Array.isArray(motions[group]) ? motions[group] : []
    list.forEach((item, index) => {
      const file = item?.file || ''
      items.push({
        key: `${group}:${index}`,
        group,
        index,
        label: item?.name || file || `${group} ${index + 1}`,
      })
    })
  }
  return items
}

export async function loadSpineModel(PIXI: { Assets: { load: (url: string) => Promise<{ baseTexture?: unknown }> } }, modelUrl: string, data: SpineModel) {
  const skeletonName = data.skeleton
  const atlases = data.atlases
  if (!skeletonName || !atlases?.length) throw new Error('Spine 模型缺少骨骼或图集')
  const binary = new Uint8Array(await (await fetch(new URL(skeletonName, modelUrl))).arrayBuffer())
  const version = readSpineVersion(binary)
  if (version && !version.startsWith('3.8')) throw new Error(`不支持的 Spine 版本 ${version}`)
  const atlas = await loadAtlases(PIXI, modelUrl, atlases)
  const parser = new SkeletonBinary(new AtlasAttachmentLoader(atlas))
  let skeletonData
  try {
    skeletonData = parser.readSkeletonData(binary)
  } catch (error) {
    throw new Error(`骨骼读取失败：${error instanceof Error ? error.message : String(error)}`)
  }
  return new Spine(skeletonData)
}

async function loadAtlases(
  PIXI: { Assets: { load: (url: string) => Promise<{ baseTexture?: unknown }> } },
  modelUrl: string,
  atlases: SpineAtlas[],
) {
  let atlas: TextureAtlas | null = null
  for (const item of atlases) {
    if (!item.atlas) continue
    const text = rewriteAtlas(await (await fetch(new URL(item.atlas, modelUrl))).text(), item)
    const loader = textureLoader(PIXI, modelUrl)
    if (!atlas) {
      atlas = await parseAtlas(text, loader)
    } else {
      await appendAtlas(atlas, text, loader)
    }
  }
  if (!atlas) throw new Error('没有图集')
  return atlas
}

function parseAtlas(text: string, loader: TextureLoader): Promise<TextureAtlas> {
  return new Promise((resolve, reject) => {
    new TextureAtlas(text, loader, (loaded) => {
      if (!loaded) reject(new Error('贴图加载失败'))
      else resolve(loaded)
    })
  })
}

function appendAtlas(atlas: TextureAtlas, text: string, loader: TextureLoader): Promise<void> {
  return new Promise((resolve, reject) => {
    atlas.addSpineAtlas(text, loader, (loaded) => {
      if (!loaded) reject(new Error('贴图加载失败'))
      else resolve()
    })
  })
}

function textureLoader(
  PIXI: { Assets: { load: (url: string) => Promise<{ baseTexture?: unknown }> } },
  modelUrl: string,
): TextureLoader {
  return (page, done) => {
    const file = page.split(/[/\\]/).pop() || page
    const url = new URL(file, modelUrl).href
    PIXI.Assets.load(url)
      .then((texture) => done(texture.baseTexture ?? texture))
      .catch(() => done(null))
  }
}

function rewriteAtlas(text: string, item: SpineAtlas): string {
  const names = item.tex_names ?? []
  const files = item.textures ?? []
  let out = text
  for (let i = 0; i < names.length; i++) {
    const name = names[i]
    const file = files[i]
    if (!name || !file) continue
    for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) out = out.split(name + ext).join(file)
  }
  return out
}

function readSpineVersion(data: Uint8Array): string {
  let offset = 0
  const readByte = () => data[offset++] ?? 0
  const readInt = () => {
    let b = readByte()
    let result = b & 0x7f
    if (b & 0x80) {
      b = readByte()
      result |= (b & 0x7f) << 7
      if (b & 0x80) {
        b = readByte()
        result |= (b & 0x7f) << 14
        if (b & 0x80) {
          b = readByte()
          result |= (b & 0x7f) << 21
          if (b & 0x80) {
            b = readByte()
            result |= (b & 0x7f) << 28
          }
        }
      }
    }
    return result >>> 0
  }
  const readString = () => {
    let count = readInt()
    if (count <= 1) return ''
    count -= 1
    const bytes = data.subarray(offset, offset + count)
    offset += count
    return new TextDecoder().decode(bytes)
  }
  try {
    readString()
    return readString()
  } catch {
    return ''
  }
}
