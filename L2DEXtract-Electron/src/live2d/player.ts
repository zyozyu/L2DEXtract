/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadLive2dVendor } from './loadVendor'

export interface Live2dMotionItem {
  key: string
  group: string
  index: number
  label: string
}

export interface Live2dControl {
  id: string
  name: string
  group: string
  min: number
  max: number
  defaultValue: number
  value: number
}

export interface Live2dPlayerState {
  modelName: string
  expressions: string[]
  motions: Live2dMotionItem[]
  currentExpression: string
  currentMotion: string
  parameters: Live2dControl[]
  parts: Live2dControl[]
  hitAreas: string[]
  eyeBlink: boolean
  breath: boolean
  physics: boolean
  lipSync: boolean
  pose: boolean
  lookAt: boolean
  canEyeBlink: boolean
  canBreath: boolean
  canPhysics: boolean
  canLipSync: boolean
  canPose: boolean
  posX: number
  posY: number
  scalePct: number
  rotation: number
  opacityPct: number
  background: string
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
  private paramOverrides = new Map<string, number>()
  private partOverrides = new Map<string, number>()
  private savedEyeBlink: any = undefined
  private savedBreath: any = undefined
  private savedPhysics: any = undefined
  private savedPose: any = undefined
  private savedNatural: ((delta: number, time: number) => void) | null = null
  private readonly onBeforeUpdate = () => {
    const core = this.model?.internalModel?.coreModel
    if (!core) return
    for (const [id, value] of this.paramOverrides) this.writeParameter(core, id, value)
    for (const [id, value] of this.partOverrides) this.writePart(core, id, value)
  }
  private readonly onPointerMove = (event: any) => {
    if (!this.state.lookAt || !this.model) return
    const point = event.data?.global
    if (!point) return
    this.model.focus(point.x, point.y)
  }
  private state: Live2dPlayerState = emptyState()

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
    this.applyBackground()
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
    this.paramOverrides.clear()
    this.partOverrides.clear()
    this.savedEyeBlink = undefined
    this.savedBreath = undefined
    this.savedPhysics = undefined
    this.savedPose = undefined
    this.savedNatural = null
    this.model = await PIXI.live2d.Live2DModel.from(modelUrl)
    this.model.internalModel?.on?.('beforeModelUpdate', this.onBeforeUpdate)
    this.model.on?.('pointermove', this.onPointerMove)
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

  setBackground(color: string) {
    this.state.background = color || '#d5dde8'
    this.applyBackground()
  }

  setExpression(name: string) {
    if (!this.model) return
    this.model.expression(name || undefined)
    this.patch({ currentExpression: name })
  }

  playMotion(group: string, index = 0) {
    if (!this.model) return
    this.model.motion(group, index)
    this.patch({ currentMotion: `${group}:${index}` })
  }

  setParameter(id: string, value: number) {
    const core = this.model?.internalModel?.coreModel
    if (!core) return
    this.paramOverrides.set(id, value)
    this.writeParameter(core, id, value)
    const item = this.state.parameters.find((param) => param.id === id)
    if (item) item.value = value
  }

  setPart(id: string, opacityPct: number) {
    const core = this.model?.internalModel?.coreModel
    if (!core) return
    this.partOverrides.set(id, opacityPct)
    this.writePart(core, id, opacityPct)
    const item = this.state.parts.find((part) => part.id === id)
    if (item) item.value = opacityPct
  }

  resetParameters() {
    const core = this.model?.internalModel?.coreModel
    this.paramOverrides.clear()
    if (!core) return
    for (const param of this.state.parameters) {
      param.value = param.defaultValue
      this.writeParameter(core, param.id, param.defaultValue)
    }
  }

  resetParts() {
    const core = this.model?.internalModel?.coreModel
    this.partOverrides.clear()
    if (!core) return
    for (const part of this.state.parts) {
      part.value = part.defaultValue
      this.writePart(core, part.id, part.defaultValue)
    }
  }

  setToggle(key: 'eyeBlink' | 'breath' | 'physics' | 'lipSync' | 'pose' | 'lookAt', on: boolean) {
    const internal = this.model?.internalModel
    if (!internal) return
    if (key === 'eyeBlink') this.toggleNullable('eyeBlink', 'savedEyeBlink', on)
    else if (key === 'breath') this.toggleBreath(on)
    else if (key === 'physics') this.toggleNullable('physics', 'savedPhysics', on)
    else if (key === 'pose') this.toggleNullable('pose', 'savedPose', on)
    else if (key === 'lipSync' && typeof internal.lipSync === 'boolean') internal.lipSync = on
    else if (key === 'lookAt' && !on) internal.focusController?.focus?.(0, 0, true)
    this.patch({ [key]: on })
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
    this.paramOverrides.clear()
    this.partOverrides.clear()
    this.patch({
      modelName: '',
      expressions: [],
      motions: [],
      parameters: [],
      parts: [],
      hitAreas: [],
      currentExpression: '',
      currentMotion: '',
      canEyeBlink: false,
      canBreath: false,
      canPhysics: false,
      canLipSync: false,
      canPose: false,
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

  private applyBackground() {
    if (!this.app) return
    const { color, alpha } = parseCssColor(this.state.background)
    const background = this.app.renderer.background
    if (background) {
      background.color = color
      background.alpha = alpha
    }
    this.app.renderer.render(this.app.stage)
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
    const cdi = await loadDisplayInfo(this.modelPath, data)
    const { parameters, parts } = this.readControls()
    applyDisplayNames(parameters, parts, cdi)
    const internal = this.model?.internalModel
    const modelName = this.modelPath.split(/[\\/]/).pop() || ''
    this.patch({
      modelName: decodeURIComponent(modelName),
      expressions,
      motions: this.collectMotions(),
      parameters,
      parts,
      hitAreas: Object.keys(internal?.hitAreas || {}),
      currentExpression: '',
      currentMotion: '',
      eyeBlink: !!internal?.eyeBlink,
      breath: !!(internal?.breath || internal?.breathParamIndex >= 0),
      physics: !!internal?.physics,
      lipSync: internal?.lipSync !== false,
      pose: !!internal?.pose,
      lookAt: false,
      canEyeBlink: !!internal?.eyeBlink,
      canBreath: !!(internal?.breath || typeof internal?.updateNaturalMovements === 'function'),
      canPhysics: !!internal?.physics,
      canLipSync: typeof internal?.lipSync === 'boolean',
      canPose: !!internal?.pose,
    })
  }

  private collectMotions(): Live2dMotionItem[] {
    const motions = this.model?.internalModel?.settings?.motions
    if (!motions) return []
    const items: Live2dMotionItem[] = []
    for (const group of Object.keys(motions)) {
      const list = Array.isArray(motions[group]) ? motions[group] : []
      const count = Math.max(1, list.length)
      for (let index = 0; index < count; index++) {
        const file = String(list[index]?.File || list[index]?.file || '')
        items.push({
          key: `${group}:${index}`,
          group,
          index,
          label: motionLabel(group, index, file, count),
        })
      }
    }
    return items
  }

  private readControls(): { parameters: Live2dControl[]; parts: Live2dControl[] } {
    const core = this.model?.internalModel?.coreModel
    if (!core) return { parameters: [], parts: [] }
    if (typeof core.getParameterCount === 'function') return readCubism4(core)
    if (typeof core.getParamCount === 'function') return readCubism2(core)
    return { parameters: [], parts: [] }
  }

  private writeParameter(core: any, id: string, value: number) {
    if (typeof core.setParameterValueById === 'function') {
      core.setParameterValueById(id, value)
      return
    }
    const index = typeof core.getParamIndex === 'function' ? core.getParamIndex(id) : -1
    if (index >= 0 && typeof core.setParamFloat === 'function') core.setParamFloat(index, value)
  }

  private writePart(core: any, id: string, opacityPct: number) {
    const opacity = opacityPct / 100
    if (typeof core.setPartOpacityById === 'function') {
      core.setPartOpacityById(id, opacity)
      return
    }
    const index = typeof core.getPartsDataIndex === 'function' ? core.getPartsDataIndex(id) : -1
    if (index >= 0 && typeof core.setPartsOpacity === 'function') core.setPartsOpacity(index, opacity)
  }

  private toggleNullable(
    field: 'eyeBlink' | 'physics' | 'pose',
    saved: 'savedEyeBlink' | 'savedPhysics' | 'savedPose',
    on: boolean,
  ) {
    const internal = this.model?.internalModel
    if (!internal) return
    if (!on) {
      if (internal[field]) this[saved] = internal[field]
      internal[field] = null
      return
    }
    if (this[saved]) internal[field] = this[saved]
  }

  private toggleBreath(on: boolean) {
    const internal = this.model?.internalModel
    if (!internal) return
    if (internal.breath !== undefined || this.savedBreath) {
      if (!on) {
        if (internal.breath) this.savedBreath = internal.breath
        internal.breath = null
      } else if (this.savedBreath) {
        internal.breath = this.savedBreath
      }
      return
    }
    if (typeof internal.updateNaturalMovements !== 'function') return
    if (!on) {
      if (!this.savedNatural) this.savedNatural = internal.updateNaturalMovements.bind(internal)
      internal.updateNaturalMovements = () => {}
      return
    }
    if (this.savedNatural) internal.updateNaturalMovements = this.savedNatural
  }

  private getMotionGroups(): string[] {
    const motions = this.model?.internalModel?.settings?.motions
    return motions ? Object.keys(motions) : []
  }

  private playRandomMotion() {
    const groups = this.getMotionGroups()
    if (!groups.length || !this.model) return
    const group = groups[Math.floor(Math.random() * groups.length)]!
    this.model.motion(group)
    this.patch({ currentMotion: group })
  }

  private patch(partial: Partial<Live2dPlayerState>) {
    this.state = { ...this.state, ...partial }
    for (const listener of this.listeners) listener(this.state)
  }
}

function parseCssColor(input: string): { color: number; alpha: number } {
  const value = input.trim()
  if (value.startsWith('#')) {
    let hex = value.slice(1)
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .split('')
        .map((char) => char + char)
        .join('')
    }
    if (hex.length === 6 || hex.length === 8) {
      const color = Number.parseInt(hex.slice(0, 6), 16)
      const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1
      if (!Number.isNaN(color)) return { color, alpha: Number.isNaN(alpha) ? 1 : alpha }
    }
  }
  const rgb = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i)
  if (rgb) {
    const r = Math.round(Number(rgb[1]))
    const g = Math.round(Number(rgb[2]))
    const b = Math.round(Number(rgb[3]))
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4])
    return { color: (r << 16) | (g << 8) | b, alpha }
  }
  return { color: 0xd5dde8, alpha: 1 }
}

function emptyState(): Live2dPlayerState {
  return {
    modelName: '',
    expressions: [],
    motions: [],
    currentExpression: '',
    currentMotion: '',
    parameters: [],
    parts: [],
    hitAreas: [],
    eyeBlink: true,
    breath: true,
    physics: true,
    lipSync: true,
    pose: true,
    lookAt: false,
    canEyeBlink: false,
    canBreath: false,
    canPhysics: false,
    canLipSync: false,
    canPose: false,
    posX: 0,
    posY: 0,
    scalePct: 100,
    rotation: 0,
    opacityPct: 100,
    background: '#d5dde8',
    ready: false,
  }
}

function readCubism4(core: any): { parameters: Live2dControl[]; parts: Live2dControl[] } {
  const parameters: Live2dControl[] = []
  const count = core.getParameterCount()
  const ids: unknown[] = core._parameterIds || core._model?.parameters?.ids || []
  for (let index = 0; index < count; index++) {
    const min = Number(core.getParameterMinimumValue(index))
    const max = Number(core.getParameterMaximumValue(index))
    const value = Number(core.getParameterValueByIndex(index))
    const fallback = Number(core.getParameterDefaultValue(index))
    parameters.push(control(idText(ids[index], `Param${index}`), min, max, fallback, value))
  }
  const parts: Live2dControl[] = []
  const partIds: unknown[] = core._partIds || core._model?.parts?.ids || []
  const partCount = typeof core.getPartCount === 'function' ? core.getPartCount() : partIds.length
  for (let index = 0; index < partCount; index++) {
    const opacity = Number(core.getPartOpacityByIndex(index))
    parts.push(control(idText(partIds[index], `Part${index}`), 0, 100, Math.round(opacity * 100), Math.round(opacity * 100)))
  }
  return { parameters, parts }
}

function readCubism2(core: any): { parameters: Live2dControl[]; parts: Live2dControl[] } {
  const parameters: Live2dControl[] = []
  const count = core.getParamCount()
  for (let index = 0; index < count; index++) {
    const min = Number(core.getParamMin?.(index) ?? 0)
    const max = Number(core.getParamMax?.(index) ?? 1)
    const value = Number(core.getParamFloat?.(index) ?? 0)
    parameters.push(control(idText(core.getParamID?.(index), `PARAM_${index}`), min, max, value, value))
  }
  const parts: Live2dControl[] = []
  const partCount = typeof core.getPartsDataCount === 'function' ? core.getPartsDataCount() : 0
  for (let index = 0; index < partCount; index++) {
    const opacity = Number(core.getPartsOpacity?.(index) ?? 1)
    parts.push(
      control(idText(core.getPartsDataID?.(index) ?? core.getPartsDataId?.(index), `PART_${index}`), 0, 100, Math.round(opacity * 100), Math.round(opacity * 100)),
    )
  }
  return { parameters, parts }
}

function control(id: string, min: number, max: number, fallback: number, value: number): Live2dControl {
  const low = Number.isFinite(min) ? min : 0
  const high = Number.isFinite(max) ? max : 1
  const base = Number.isFinite(fallback) ? fallback : 0
  const current = Number.isFinite(value) ? value : base
  return {
    id,
    name: paramName(id),
    group: '',
    min: Math.min(low, high),
    max: Math.max(low, high),
    defaultValue: clamp(base, Math.min(low, high), Math.max(low, high)),
    value: clamp(current, Math.min(low, high), Math.max(low, high)),
  }
}

function applyDisplayNames(parameters: Live2dControl[], parts: Live2dControl[], cdi: any) {
  if (!cdi) return
  const groups = new Map<string, { name: string; parent: string }>()
  for (const item of cdi.ParameterGroups || []) {
    if (item?.Id) groups.set(String(item.Id), { name: String(item.Name || ''), parent: String(item.GroupId || '') })
  }
  const paramInfo = new Map<string, { name: string; group: string }>()
  for (const item of cdi.Parameters || []) {
    if (!item?.Id) continue
    paramInfo.set(String(item.Id), { name: String(item.Name || ''), group: groupPath(String(item.GroupId || ''), groups) })
  }
  for (const param of parameters) {
    const info = paramInfo.get(param.id)
    if (info?.name) param.name = info.name
    if (info?.group) param.group = info.group
  }
  const partNames = new Map<string, string>()
  for (const item of cdi.Parts || []) {
    if (item?.Id && item.Name) partNames.set(String(item.Id), String(item.Name))
  }
  for (const part of parts) {
    const name = partNames.get(part.id)
    if (name) part.name = name
  }
}

function groupPath(id: string, groups: Map<string, { name: string; parent: string }>) {
  const names: string[] = []
  const seen = new Set<string>()
  let current = id
  while (current && groups.has(current) && !seen.has(current)) {
    seen.add(current)
    const group = groups.get(current)!
    if (group.name) names.unshift(group.name)
    current = group.parent
  }
  return names.join(' / ')
}

async function loadDisplayInfo(modelUrl: string, data: any) {
  const urls: string[] = []
  const display = data?.FileReferences?.DisplayInfo
  if (typeof display === 'string' && display) {
    try {
      urls.push(new URL(display, modelUrl).href)
    } catch {
      /* 相对路径无效时继续试同名 cdi */
    }
  }
  const sibling = modelUrl.replace(/\.model3\.json(\?.*)?$/i, '.cdi3.json')
  if (sibling !== modelUrl) urls.push(sibling)
  for (const url of urls) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()
    } catch {
      /* 没有显示信息就用标准参数名 */
    }
  }
  return null
}

function motionLabel(group: string, index: number, file: string, count: number) {
  const stem = file.split(/[/\\]/).pop()?.replace(/\.motion3?\.json$/i, '') || ''
  if (stem) return stem
  const name = MOTION_GROUPS[group.toLowerCase()] || group
  return count > 1 ? `${name} ${index + 1}` : name
}

function paramName(id: string) {
  const key = id.replace(/^param/i, '').replace(/^PARAM_/, '').replace(/_/g, '').toLowerCase()
  return PARAM_NAMES[key] || id
}

function idText(raw: unknown, fallback: string) {
  if (typeof raw === 'string' && raw) return raw
  if (raw && typeof raw === 'object' && 's' in raw && typeof (raw as { s?: string }).s === 'string') return (raw as { s: string }).s
  if (raw && typeof (raw as { toString?: () => string }).toString === 'function') {
    const text = String(raw)
    if (text && text !== '[object Object]') return text
  }
  return fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const MOTION_GROUPS: Record<string, string> = {
  idle: '闲置',
  tap: '点击',
  tapbody: '点击身体',
  taphead: '点击头部',
  flick: '轻拂',
  flickup: '上轻拂',
  flickdown: '下轻拂',
  pinchin: '捏合',
  pinchout: '捏开',
  shake: '摇晃',
}

const PARAM_NAMES: Record<string, string> = {
  anglex: '角度 X',
  angley: '角度 Y',
  anglez: '角度 Z',
  eyeballx: '眼球 X',
  eyebally: '眼球 Y',
  eyeballform: '眼球 变形',
  eyelopen: '左眼 开合',
  eyeropen: '右眼 开合',
  eyelsmile: '左眼 微笑',
  eyersmile: '右眼 微笑',
  browly: '左眉 上下',
  browry: '右眉 上下',
  browlx: '左眉 左右',
  browrx: '右眉 左右',
  browlangle: '左眉 角度',
  browrangle: '右眉 角度',
  browlform: '左眉 变形',
  browrform: '右眉 变形',
  mouthform: '嘴 变形',
  mouthopeny: '嘴 开合',
  cheek: '脸颊',
  bodyanglex: '身体旋转 X',
  bodyangley: '身体旋转 Y',
  bodyanglez: '身体旋转 Z',
  breath: '呼吸',
  hairfront: '前发',
  hairside: '侧发',
  hairback: '后发',
  hairfluffy: '头发摇动',
  shouldery: '肩膀 上下',
  bustx: '胸部 X',
  busty: '胸部 Y',
  armla: '左臂 A',
  armra: '右臂 A',
  armlb: '左臂 B',
  armrb: '右臂 B',
  handl: '左手',
  handr: '右手',
  basex: '基准 X',
  basey: '基准 Y',
}
