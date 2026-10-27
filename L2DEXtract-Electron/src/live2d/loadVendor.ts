import * as PixiNs from 'pixi.js'

const PIXI = { ...PixiNs } as typeof PixiNs & { live2d?: unknown }

const SCRIPTS = [
  '/live2d-vendor/live2dcubismcore.min.js',
  '/live2d-vendor/live2d.min.js',
  '/live2d-vendor/index.min.js',
]

let loading: Promise<void> | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-live2d="${src}"]`)
    if (existing) {
      if (existing.dataset.loaded === '1') resolve()
      else existing.addEventListener('load', () => resolve(), { once: true })
      return
    }
    const el = document.createElement('script')
    el.src = src
    el.async = false
    el.dataset.live2d = src
    el.onload = () => {
      el.dataset.loaded = '1'
      resolve()
    }
    el.onerror = () => reject(new Error(`加载失败: ${src}`))
    document.head.appendChild(el)
  })
}

export function loadLive2dVendor(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      ;(globalThis as unknown as { PIXI?: unknown }).PIXI = PIXI
      for (const src of SCRIPTS) await loadScript(src)
      if (!PIXI.live2d) throw new Error('Live2D 库未就绪')
    })().catch((error: unknown) => {
      loading = null
      throw error
    })
  }
  return loading
}
