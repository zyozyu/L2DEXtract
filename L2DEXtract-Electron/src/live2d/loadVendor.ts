const SCRIPTS = [
  '/live2d-vendor/live2dcubismcore.min.js',
  '/live2d-vendor/live2d.min.js',
  '/live2d-vendor/pixi.min.js',
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
      if (src.endsWith('pixi.min.js')) {
        const g = globalThis as unknown as { PIXI?: unknown }
        if (g.PIXI === undefined && typeof PIXI !== 'undefined') {
          g.PIXI = PIXI
        }
      }
      resolve()
    }
    el.onerror = () => reject(new Error(`加载失败: ${src}`))
    document.head.appendChild(el)
  })
}

export function loadLive2dVendor(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      for (const src of SCRIPTS) {
        await loadScript(src)
      }
      const g = globalThis as unknown as { PIXI?: { live2d?: unknown } }
      if (!g.PIXI?.live2d) throw new Error('Live2D 库未就绪')
    })().catch((error: unknown) => {
      loading = null
      throw error
    })
  }
  return loading
}

declare const PIXI: unknown
