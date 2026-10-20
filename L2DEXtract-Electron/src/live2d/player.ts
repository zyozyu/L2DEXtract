/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadLive2dVendor } from './loadVendor'

export interface Live2dPlayerState {
  modelName: string
  expressions: string[]
  motions: string[]
  currentExpression: string
  currentMotion: string
  posX: number
  posY: number
  scalePct: number
  rotation: number
  opacityPct: number
  ready: boolean
}

type Listener = (state: Live2dPlayerState) => void

export class Live2dPlayer {
  private app: any = null
  private model: any = null
  private modelPath = ''
  private modelData: any = null
  private placeholder: any = null
  private canvasWidth = 0
  private canvasHeight = 0
  private baseScale = 1
  private resizeObserver: ResizeObserver | null = null
  private listeners = new Set<Listener>()
  private state: Live2dPlayerState = {
    modelName: '',
    expressions: [],
    motions: [],
    currentExpression: '',
    currentMotion: '',
    posX: 0,
    posY: 0,
    scalePct: 100,
    rotation: 0,
    opacityPct: 100,
    ready: false,
  }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly container: HTMLElement,
  ) {}

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  async init(): Promise<void> {
    await loadLive2dVendor()
    const PIXI = (globalThis as unknown as { PIXI: any }).PIXI
    this.measure()
    this.app = new PIXI.Application({
      view: this.canvas,
      width: this.canvasWidth,
      height: this.canvasHeight,
      backgroundColor: 0xd5dde8,
      backgroundAlpha: 1,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true,
    })
    this.placeholder = new PIXI.Text('', {
      fontFamily: 'Manrope, sans-serif',
      fontSize: 18,
      fill: 0x5c6b7c,
      align: 'center',
    })
    this.placeholder.anchor.set(0.5)
    this.placeholder.x = this.canvasWidth / 2
    this.placeholder.y = this.canvasHeight / 2
    this.app.stage.addChild(this.placeholder)
    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(this.container)
    this.patch({ ready: true })
  }

  async loadModel(modelUrl: string): Promise<void> {
    if (!this.app) throw new Error('预览器未初始化')
    const PIXI = (globalThis as unknown as { PIXI: any }).PIXI
    if (this.placeholder) {
      this.app.stage.removeChild(this.placeholder)
      this.placeholder.destroy()
      this.placeholder = null
    }
    if (this.model) {
      this.app.stage.removeChild(this.model)
      this.model.destroy()
      this.model = null
    }
    this.modelPath = modelUrl
    this.modelData = null
    this.model = await PIXI.live2d.Live2DModel.from(modelUrl)
    this.app.stage.addChild(this.model)
    this.model.visible = true
    this.model.interactive = true
    this.model.on('pointerdown', () => this.playRandomMotion())
    await this.refreshModelInfo()
    this.autoFit()
  }

  setTransform(partial: Partial<Pick<Live2dPlayerState, 'posX' | 'posY' | 'scalePct' | 'rotation' | 'opacityPct'>>) {
    this.patch(partial)
    this.applyTransform()
  }

  setExpression(name: string) {
    if (!this.model) return
    this.model.expression(name || undefined)
    this.patch({ currentExpression: name })
  }

  playMotion(group: string) {
    if (!this.model) return
    this.model.motion(group)
    this.patch({ currentMotion: group })
  }

  autoFit() {
    if (!this.model || !this.app) return
    const margin = 40
    const availW = Math.max(100, this.canvasWidth - margin * 2)
    const availH = Math.max(100, this.canvasHeight - margin * 2)
    const bounds = this.model.getLocalBounds()
    const w0 = Math.max(1, bounds.width)
    const h0 = Math.max(1, bounds.height)
    let scale = Math.min(availW / w0, availH / h0)
    scale = Math.max(0.1, Math.min(scale * 0.85, 5))
    this.baseScale = scale
    this.model.pivot.set(bounds.x + w0 / 2, bounds.y + h0 / 2)
    this.patch({ posX: 0, posY: 0, scalePct: 100, rotation: 0, opacityPct: 100 })
    this.applyTransform()
  }

  clear() {
    if (this.model && this.app) {
      this.app.stage.removeChild(this.model)
      this.model.destroy()
      this.model = null
    }
    this.modelPath = ''
    this.modelData = null
    this.patch({
      modelName: '',
      expressions: [],
      motions: [],
      currentExpression: '',
      currentMotion: '',
    })
  }

  destroy() {
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    if (this.model) {
      this.model.destroy()
      this.model = null
    }
    if (this.app) {
      this.app.destroy(true, { children: true })
      this.app = null
    }
  }

  private measure() {
    this.canvasWidth = Math.max(320, Math.floor(this.container.clientWidth))
    this.canvasHeight = Math.max(240, Math.floor(this.container.clientHeight))
  }

  private handleResize() {
    if (!this.app) return
    this.measure()
    this.app.renderer.resize(this.canvasWidth, this.canvasHeight)
    if (this.placeholder) {
      this.placeholder.x = this.canvasWidth / 2
      this.placeholder.y = this.canvasHeight / 2
    }
    if (this.model) this.autoFit()
  }

  private applyTransform() {
    if (!this.model || !this.app) return
    const finalScale = this.baseScale * (this.state.scalePct / 100)
    this.model.scale.set(finalScale)
    this.model.position.set(
      this.canvasWidth / 2 + this.state.posX,
      this.canvasHeight / 2 + this.state.posY,
    )
    this.model.rotation = (this.state.rotation * Math.PI) / 180
    this.model.alpha = this.state.opacityPct / 100
    this.app.renderer.render(this.app.stage)
  }

  private async refreshModelInfo() {
    let data = this.modelData
    if (!data && this.modelPath) {
      try {
        data = await (await fetch(this.modelPath)).json()
        this.modelData = data
      } catch {
        data = null
      }
    }
    const expressions =
      data?.FileReferences?.Expressions?.map(
        (item: { Name?: string; name?: string }) => item.Name || item.name || '',
      ).filter(Boolean) ?? []
    const motions = this.getMotionGroups()
    const modelName = this.modelPath.split(/[\\/]/).pop() || ''
    this.patch({
      modelName: decodeURIComponent(modelName),
      expressions,
      motions,
      currentExpression: '',
      currentMotion: '',
    })
  }

  private getMotionGroups(): string[] {
    const motions = this.model?.internalModel?.settings?.motions
    return motions ? Object.keys(motions) : []
  }

  private playRandomMotion() {
    const groups = this.getMotionGroups()
    if (groups.length) this.playMotion(groups[Math.floor(Math.random() * groups.length)]!)
  }

  private patch(partial: Partial<Live2dPlayerState>) {
    this.state = { ...this.state, ...partial }
    for (const listener of this.listeners) listener(this.state)
  }
}
