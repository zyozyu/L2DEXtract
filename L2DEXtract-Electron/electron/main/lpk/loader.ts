import AdmZip from 'adm-zip'
import fs from 'node:fs'
import path from 'node:path'
import {
  decrypt,
  findEncryptedFile,
  genkey,
  guessType,
  hashedFilename,
  isEncryptedFile,
  normalizeName,
  pyStrip,
  travels,
} from './crypto.ts'

export interface ExtractResult {
  outputDir: string
  characterDirs: string[]
}

export interface ExtractOptions {
  lpkPath: string
  configPath?: string
  outputDir: string
  log?: (line: string) => void
  askFileId?: () => Promise<string>
  tick?: () => Promise<void>
}

interface MlveCostume {
  path?: string
}

interface MlveCharacter {
  character?: string
  costume?: MlveCostume[]
}

interface MlveConfig {
  type?: string
  id?: string
  encrypt?: string
  list?: MlveCharacter[]
}

interface SteamConfig {
  fileId?: string
  metaData?: string
  lpkFile?: string
  title?: string
}

const MODEL_COMMANDS = ['change_cos', 'change_model', 'add_submodel', 'remove_submodel']

export async function extractLpk(options: ExtractOptions): Promise<ExtractResult> {
  const loader = new LpkLoader(options)
  return loader.extract(options.outputDir)
}

class LpkLoader {
  private readonly lpkPath: string
  private readonly configPath: string
  private readonly log: (line: string) => void
  private readonly askFileId: () => Promise<string>
  private readonly tick: () => Promise<void>
  private readonly zip: AdmZip
  private mlve: MlveConfig
  private lpkType = ''
  private config: SteamConfig | null = null
  private readonly trans = new Map<string, string>()
  private readonly entries = new Map<string, string>()
  private readonly characterDirs: string[] = []

  constructor(options: ExtractOptions) {
    this.lpkPath = options.lpkPath
    this.configPath = options.configPath ?? ''
    this.log = options.log ?? (() => {})
    this.askFileId = options.askFileId ?? (async () => '')
    this.tick = options.tick ?? (async () => {})
    if (!fs.existsSync(this.lpkPath)) throw new Error('LPK 文件不存在')
    try {
      this.zip = new AdmZip(this.lpkPath)
    } catch (error) {
      throw new Error(`无法打开 LPK：${errorText(error)}`)
    }
    this.mlve = this.readMlve()
    this.lpkType = this.mlve.type ?? ''
    if (this.lpkType === 'STM_1_0') this.loadConfig()
  }

  async extract(outputDir: string): Promise<ExtractResult> {
    fs.mkdirSync(outputDir, { recursive: true })
    let subdir = ''
    try {
      if (this.lpkType === 'STD2_0' || this.lpkType === 'STM_1_0') {
        subdir = await this.extractModern(outputDir)
      } else {
        if (this.lpkType !== 'STD_1_0') {
          this.log('检测到旧版或未知 LPK，按 STD_1_0 尝试解包')
          this.lpkType = 'STD_1_0'
        }
        subdir = await this.extractLegacy(outputDir)
      }
    } catch (error) {
      this.removeEmptyDir(subdir)
      throw error instanceof Error ? error : new Error(errorText(error))
    }
    return { outputDir, characterDirs: this.characterDirs }
  }

  private async extractModern(outputDir: string): Promise<string> {
    let subdir = ''
    const list = this.mlve.list ?? []
    for (const chara of list) {
      const charaName = this.characterName(chara)
      subdir = path.join(outputDir, normalizeName(charaName))
      this.ensureDir(subdir)
      this.rememberDir(subdir)
      const costumes = chara.costume ?? []
      for (let i = 0; i < costumes.length; i++) {
        this.log(`正在解包 ${charaName}_costume_${i}`)
        await this.extractCostume(costumes[i] ?? {}, subdir)
        await this.tick()
      }
      this.writeModelEntries(subdir)
    }
    return subdir
  }

  private async extractLegacy(outputDir: string): Promise<string> {
    const encrypted = this.mlve.encrypt ?? 'true'
    if (encrypted === 'false') {
      this.log('LPK 未加密，直接解压全部文件')
      this.zip.extractAllTo(outputDir, true)
      this.rememberDir(outputDir)
      return outputDir
    }
    for (const entry of this.zip.getEntries()) {
      const stored = entry.entryName
      const name = stored.replaceAll('\\', '/')
      if (entry.isDirectory || extname(name) === '') continue
      const subdir = path.join(outputDir, normalizeName(posixDirname(name)))
      const outputFile = path.join(subdir, normalizeName(path.posix.basename(name)))
      this.ensureDir(subdir)
      this.rememberDir(subdir)
      if (['.json', '.mlve', '.txt'].includes(extname(name).toLowerCase())) {
        this.log(`解出 ${name}`)
        this.zip.extractEntryTo(entry, outputDir, true, true)
      } else {
        this.log(`解密 ${name} -> ${outputFile}`)
        fs.writeFileSync(outputFile, this.decryptFile(stored))
      }
      await this.tick()
    }
    return outputDir
  }

  private async extractCostume(costume: MlveCostume, dir: string): Promise<void> {
    if (!costume.path) return
    await this.checkDecrypt(costume.path)
    await this.extractModelJson(costume.path, dir)
  }

  private async extractModelJson(modelJson: string, dir: string): Promise<void> {
    if (this.trans.has(modelJson)) return
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(this.decryptFile(modelJson))
    const entry = JSON.parse(raw) as unknown
    const id = this.entries.size
    this.entries.set(`model${id}.json`, JSON.stringify(entry))
    this.trans.set(modelJson, `model${id}.json`)

    for (const [rawName, val] of travels(entry)) {
      let name = rawName
      if (
        typeof val === 'string' &&
        val &&
        (name.toLowerCase().endsWith('_command') || name.toLowerCase().endsWith('_postcommand'))
      ) {
        for (const cmd of val.split(';')) {
          const encFile = findEncryptedFile(cmd)
          if (!encFile) continue
          if (this.isModelCommand(cmd)) {
            await this.extractModelJson(encFile, dir)
          } else {
            name += `_${id}`
            name = this.changeName(name)
            const suffix = this.recovery(encFile, path.join(dir, name))
            this.trans.set(encFile, name + suffix)
          }
        }
      }
      if (isEncryptedFile(val)) {
        if (this.trans.has(val)) continue
        name += `_${id}`
        name = this.changeName(name)
        const suffix = this.recovery(val, path.join(dir, name))
        this.trans.set(val, name + suffix)
      }
    }
    await this.tick()
  }

  private async checkDecrypt(filename: string): Promise<void> {
    this.log('尝试解密模型入口')
    if (this.canDecode(filename)) return
    this.log('尝试自动修正 fileId')
    if (!this.config) throw new Error('缺少 config.json')
    const possible: string[] = []
    if (this.config.lpkFile) possible.push(pyStrip(this.config.lpkFile, '.lpk'))
    for (const fileId of possible) {
      this.config.fileId = fileId
      if (this.canDecode(filename)) return
    }
    const fileId = (await this.askFileId()).trim()
    if (!fileId) throw new Error('未提供 fileId，已取消解包')
    this.config.fileId = fileId
    if (!this.canDecode(filename)) throw new Error('解密失败，fileId 不正确')
  }

  private canDecode(filename: string): boolean {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(this.decryptFile(filename))
      return true
    } catch {
      return false
    }
  }

  private recovery(filename: string, output: string): string {
    const data = this.decryptFile(filename)
    const suffix = guessType(data)
    const dest = output + suffix
    this.log(`还原 ${filename} -> ${dest}`)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, data)
    return suffix
  }

  private decryptFile(filename: string): Buffer {
    return decrypt(this.getKey(filename), this.readZip(filename))
  }

  private getKey(file: string): bigint {
    const id = this.mlve.id ?? ''
    if (this.lpkType === 'STM_1_0' && this.mlve.encrypt != null && this.mlve.encrypt !== 'true') return 0n
    if (this.lpkType === 'STM_1_0') {
      if (this.config?.metaData == null) throw new Error('config.json 缺少 metaData')
      return genkey(`${id}${this.config.fileId ?? ''}${file}${this.config.metaData}`)
    }
    if (this.lpkType === 'STD2_0' || this.lpkType === 'STD_1_0') return genkey(id + file)
    throw new Error(`不支持的类型 ${this.mlve.type ?? ''}`)
  }

  private changeName(name: string): string {
    return name.replaceAll('FileReferences_', '').replaceAll('\\', '/')
  }

  private isModelCommand(cmd: string): boolean {
    return MODEL_COMMANDS.some((item) => cmd.startsWith(item))
  }

  private writeModelEntries(dir: string): void {
    for (const [name, content] of this.entries) {
      let out = content
      for (const [from, to] of this.trans) out = out.split(from).join(to)
      fs.writeFileSync(path.join(dir, name), out, 'utf8')
    }
  }

  private characterName(chara: MlveCharacter): string {
    if (this.lpkType === 'STM_1_0' && this.config && Object.hasOwn(this.config, 'title')) {
      return this.config.title ?? ''
    }
    return chara.character ? chara.character : 'character'
  }

  private loadConfig(): void {
    if (!this.configPath || !fs.existsSync(this.configPath)) {
      throw new Error('STM_1_0 需要 config.json')
    }
    this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf8')) as SteamConfig
  }

  private readMlve(): MlveConfig {
    const hashed = hashedFilename('config.mlve')
    try {
      return JSON.parse(decodeText(this.readZip(hashed))) as MlveConfig
    } catch {
      try {
        return JSON.parse(decodeText(this.readZip('config.mlve'))) as MlveConfig
      } catch (error) {
        throw new Error(`读取 LPK 配置失败：${errorText(error)}`)
      }
    }
  }

  private readZip(name: string): Buffer {
    const wanted = name.replaceAll('\\', '/')
    const entry =
      this.zip.getEntry(wanted) ??
      this.zip.getEntries().find((item) => item.entryName.replaceAll('\\', '/') === wanted)
    if (!entry || entry.isDirectory) throw new Error(`LPK 中找不到 ${name}`)
    return entry.getData()
  }

  private ensureDir(dir: string): void {
    if (fs.existsSync(dir)) return
    fs.mkdirSync(dir, { recursive: true })
    this.log(`创建目录 ${dir}`)
  }

  private rememberDir(dir: string): void {
    if (!this.characterDirs.includes(dir)) this.characterDirs.push(dir)
  }

  private removeEmptyDir(dir: string): void {
    if (!dir || !fs.existsSync(dir)) return
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
  }
}

function decodeText(data: Buffer): string {
  if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    return data.subarray(3).toString('utf8')
  }
  return data.toString('utf8')
}

function posixDirname(file: string): string {
  const dir = path.posix.dirname(file)
  return dir === '.' ? '' : dir
}

function extname(file: string): string {
  const base = path.posix.basename(file)
  const index = base.lastIndexOf('.')
  if (index <= 0) return ''
  return base.slice(index)
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
