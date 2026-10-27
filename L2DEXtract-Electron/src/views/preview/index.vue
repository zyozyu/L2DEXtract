<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Live2dPlayer, type Live2dControl, type Live2dPlayerState } from '@/live2d/player'
import { useOutputStore } from '@/stores/output'

const route = useRoute()
const router = useRouter()
const outputStore = useOutputStore()
const { outputDir } = storeToRefs(outputStore)
const models = ref<ListedModel[]>([])
const activeKey = ref('')
const loading = ref(false)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
let ticket = 0

const playerState = reactive<Live2dPlayerState>({
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
})

const motionGroups = computed(() => {
  const groups: { name: string; items: { key: string; label: string; group: string; index: number }[] }[] = []
  const index = new Map<string, { key: string; label: string; group: string; index: number }[]>()
  for (const item of playerState.motions) {
    let items = index.get(item.group)
    if (!items) {
      items = []
      index.set(item.group, items)
      groups.push({ name: item.group, items })
    }
    items.push(item)
  }
  return groups
})

const parameterGroups = computed(() => {
  const groups: { name: string; items: Live2dControl[] }[] = []
  const index = new Map<string, Live2dControl[]>()
  for (const param of playerState.parameters) {
    const name = param.group
    let items = index.get(name)
    if (!items) {
      items = []
      index.set(name, items)
      groups.push({ name, items })
    }
    items.push(param)
  }
  return groups
})

const backgroundPresets = ['#d5dde8', '#eef3f6', '#ffffff', '#1e5168', '#00000000']

let player: Live2dPlayer | null = null
let unsub: (() => void) | null = null

onMounted(async () => {
  await window.api.startPreview()
  if (!canvasRef.value || !stageRef.value) return
  player = new Live2dPlayer(canvasRef.value, stageRef.value)
  unsub = player.onChange((state) => Object.assign(playerState, state))
  try {
    await player.init()
    const output = queryOutput()
    if (output) outputDir.value = output
    else await outputStore.ensure()
    if (outputDir.value) await scan(outputDir.value, true)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
})

onUnmounted(() => {
  unsub?.()
  player?.destroy()
  player = null
})

watch(
  () => route.query.output,
  (output) => {
    if (typeof output === 'string' && output && output !== outputDir.value && playerState.ready) {
      void scan(output, true)
    }
  },
)

function queryOutput() {
  const output = route.query.output
  if (typeof output === 'string' && output) return output
  const dir = route.query.dir
  return typeof dir === 'string' ? dir : ''
}

function modelKey(model: ListedModel) {
  return `${model.dir}\0${model.file}`
}

async function scan(dir: string, loadFirst: boolean) {
  outputDir.value = dir
  try {
    models.value = await window.api.listModels(dir)
  } catch (error) {
    models.value = []
    activeKey.value = ''
    ElMessage.error(error instanceof Error ? error.message : String(error))
    return
  }
  if (loadFirst && models.value[0]) await openModel(models.value[0])
}

async function pick() {
  const dir = await window.api.selectDirectory()
  if (!dir || dir === outputDir.value) return
  await scan(dir, true)
  await router.replace({ path: '/preview', query: { output: dir } })
}

async function saveAsModel(model: ListedModel) {
  try {
    const dest = await window.api.saveModelAs(model.dir)
    if (!dest) return
    ElMessage.success('已另存')
    if (outputDir.value) await scan(outputDir.value, false)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

async function openFolder(model: ListedModel) {
  try {
    await window.api.openPath(model.dir)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

async function removeModel(model: ListedModel) {
  try {
    await ElMessageBox.confirm(`删除「${model.name}」？这个目录里的文件会一起去掉。`, '删除模型', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  const removed = modelKey(model)
  ticket += 1
  try {
    await window.api.deleteModel(model.dir)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
    return
  }
  if (outputDir.value) await scan(outputDir.value, false)
  if (models.value.some((item) => modelKey(item) === removed)) return
  player?.clear()
  activeKey.value = ''
  if (models.value[0]) await openModel(models.value[0])
}

async function openModel(model: ListedModel) {
  if (!player) return
  const mine = ++ticket
  activeKey.value = modelKey(model)
  loading.value = true
  try {
    await window.api.startPreview()
    if (mine !== ticket || !player) return
    const result = await window.api.loadModel(model.dir, model.file)
    if (mine !== ticket || !player) return
    await player.loadModel(result.modelUrl)
  } catch (error) {
    if (mine === ticket) ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    if (mine === ticket) loading.value = false
  }
}

function onTransform() {
  player?.setTransform({
    posX: playerState.posX,
    posY: playerState.posY,
    scalePct: playerState.scalePct,
    rotation: playerState.rotation,
    opacityPct: playerState.opacityPct,
  })
}

function onExpression(value: string | number | boolean | null | undefined) {
  player?.setExpression(typeof value === 'string' ? value : '')
}

function onMotion(value: string | number | boolean | null | undefined) {
  if (typeof value !== 'string') return
  const item = playerState.motions.find((motion) => motion.key === value)
  if (item) player?.playMotion(item.group, item.index)
}

function onBackground(value: string | null) {
  player?.setBackground(value || '#d5dde8')
}

function onToggle(
  key: 'eyeBlink' | 'breath' | 'physics' | 'lipSync' | 'pose' | 'lookAt',
  value: boolean | string | number,
) {
  player?.setToggle(key, value === true)
}

function onParameter(id: string, value: number | number[]) {
  const next = Array.isArray(value) ? value[0] : value
  if (typeof next !== 'number') return
  const param = playerState.parameters.find((item) => item.id === id)
  if (param) param.value = next
  player?.setParameter(id, next)
}

function onPart(id: string, value: number | number[]) {
  const next = Array.isArray(value) ? value[0] : value
  if (typeof next !== 'number') return
  const part = playerState.parts.find((item) => item.id === id)
  if (part) part.value = next
  player?.setPart(id, next)
}

function resetParameters() {
  player?.resetParameters()
  for (const param of playerState.parameters) param.value = param.defaultValue
}

function resetParts() {
  player?.resetParts()
  for (const part of playerState.parts) part.value = part.defaultValue
}

function formatValue(value: number) {
  if (!Number.isFinite(value)) return ''
  const abs = Math.abs(value)
  if (abs >= 100) return value.toFixed(0)
  if (abs >= 10) return value.toFixed(1)
  return value.toFixed(2)
}

function paramStep(param: Live2dControl) {
  const span = Math.abs(param.max - param.min)
  if (span >= 100) return 1
  if (span >= 2) return 0.01
  return 0.001
}
</script>

<template>
  <section class="preview">
    <el-card class="panel" shadow="never">
      <template #header>
        <div class="head">
          <span>模型</span>
          <el-text type="info">按导出路径列出，点一下切换。</el-text>
        </div>
      </template>

      <el-form label-position="top">
        <el-form-item label="导出路径">
          <el-input v-model="outputDir" readonly placeholder="导出路径">
            <template #append>
              <el-button @click="pick">浏览</el-button>
            </template>
          </el-input>
        </el-form-item>
      </el-form>

      <div v-if="outputDir" class="models">
        <p v-if="!models.length" class="models-empty">这个目录里没有模型</p>
        <ul v-else>
          <li v-for="model in models" :key="modelKey(model)">
            <button
              type="button"
              :class="{ on: activeKey === modelKey(model), busy: loading && activeKey === modelKey(model) }"
              :title="`${model.dir}\\${model.file}`"
              @click="openModel(model)"
            >
              <span class="model-name">{{ model.name }}</span>
              <span class="model-ops">
                <span title="打开文件夹" @click.stop="openFolder(model)">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-10Z" />
                  </svg>
                </span>
                <span class="export" title="另存为" @click.stop="saveAsModel(model)">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M14 4h6v6" />
                    <path d="M20 4 10 14" />
                    <path d="M18 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5.5" />
                  </svg>
                </span>
                <span class="danger" title="删除" @click.stop="removeModel(model)">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7h16" />
                    <path d="M9 7V4h6v3" />
                    <path d="M7 7l1 13h8l1-13" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </span>
              </span>
            </button>
          </li>
        </ul>
      </div>
    </el-card>

    <div ref="stageRef" class="stage">
      <canvas ref="canvasRef" />
      <div v-if="!playerState.modelName" class="hint">
        <el-text type="info">{{ outputDir ? '选择左侧模型' : '先选择导出路径' }}</el-text>
      </div>
    </div>

    <el-card class="panel params" shadow="never">
      <template #header>
        <div class="head">
          <span>模型参数</span>
          <el-text type="info">{{ playerState.modelName || '选择模型后调节' }}</el-text>
        </div>
      </template>

      <div v-if="playerState.modelName" class="inspector">
        <section>
          <p class="section">显示</p>
          <div class="param-row">
            <div class="param-label"><span>位置 X</span><span>{{ playerState.posX }}</span></div>
            <el-slider v-model="playerState.posX" :min="-400" :max="400" @input="onTransform" />
          </div>
          <div class="param-row">
            <div class="param-label"><span>位置 Y</span><span>{{ playerState.posY }}</span></div>
            <el-slider v-model="playerState.posY" :min="-400" :max="400" @input="onTransform" />
          </div>
          <div class="param-row">
            <div class="param-label"><span>缩放</span><span>{{ playerState.scalePct }}%</span></div>
            <el-slider v-model="playerState.scalePct" :min="10" :max="300" @input="onTransform" />
          </div>
          <div class="param-row">
            <div class="param-label"><span>旋转</span><span>{{ playerState.rotation }}°</span></div>
            <el-slider v-model="playerState.rotation" :min="-180" :max="180" @input="onTransform" />
          </div>
          <div class="param-row">
            <div class="param-label"><span>不透明度</span><span>{{ playerState.opacityPct }}%</span></div>
            <el-slider v-model="playerState.opacityPct" :min="0" :max="100" @input="onTransform" />
          </div>
          <div class="param-row">
            <div class="param-label"><span>背景</span></div>
            <el-color-picker
              v-model="playerState.background"
              show-alpha
              :predefine="backgroundPresets"
              @active-change="onBackground"
              @change="onBackground"
            />
          </div>
          <div class="actions">
            <el-button @click="player?.autoFit()">自适应</el-button>
          </div>
        </section>

        <section>
          <p class="section">表情</p>
          <el-select
            v-model="playerState.currentExpression"
            clearable
            placeholder="无"
            @change="onExpression"
          >
            <el-option v-for="name in playerState.expressions" :key="name" :label="name" :value="name" />
          </el-select>
        </section>

        <section>
          <p class="section">动作</p>
          <el-select
            v-model="playerState.currentMotion"
            clearable
            placeholder="无"
            @change="onMotion"
          >
            <el-option-group v-for="group in motionGroups" :key="group.name" :label="group.name">
              <el-option v-for="item in group.items" :key="item.key" :label="item.label" :value="item.key" />
            </el-option-group>
          </el-select>
        </section>

        <section>
          <p class="section">自动</p>
          <div class="switches">
            <label v-if="playerState.canEyeBlink" class="switch">
              <span>自动眨眼</span>
              <el-switch v-model="playerState.eyeBlink" @change="onToggle('eyeBlink', $event)" />
            </label>
            <label v-if="playerState.canBreath" class="switch">
              <span>呼吸</span>
              <el-switch v-model="playerState.breath" @change="onToggle('breath', $event)" />
            </label>
            <label v-if="playerState.canPhysics" class="switch">
              <span>物理演算</span>
              <el-switch v-model="playerState.physics" @change="onToggle('physics', $event)" />
            </label>
            <label v-if="playerState.canLipSync" class="switch">
              <span>口形同步</span>
              <el-switch v-model="playerState.lipSync" @change="onToggle('lipSync', $event)" />
            </label>
            <label v-if="playerState.canPose" class="switch">
              <span>姿势</span>
              <el-switch v-model="playerState.pose" @change="onToggle('pose', $event)" />
            </label>
            <label class="switch">
              <span>视线追随</span>
              <el-switch v-model="playerState.lookAt" @change="onToggle('lookAt', $event)" />
            </label>
          </div>
        </section>

        <section v-if="playerState.parameters.length">
          <div class="section-row">
            <p class="section">参数</p>
            <button type="button" class="text-btn" @click="resetParameters">恢复默认</button>
          </div>
          <template v-for="group in parameterGroups" :key="group.name || 'all'">
            <p v-if="group.name" class="group-name">{{ group.name }}</p>
            <div v-for="param in group.items" :key="param.id" class="param-row">
              <div class="param-label">
                <span :title="param.id">{{ param.name }}</span>
                <span>{{ formatValue(param.value) }}</span>
              </div>
              <el-slider
                :model-value="param.value"
                :min="param.min"
                :max="param.max === param.min ? param.min + 1 : param.max"
                :step="paramStep(param)"
                :disabled="param.max === param.min"
                :show-tooltip="false"
                @input="onParameter(param.id, $event)"
              />
            </div>
          </template>
        </section>

        <section v-if="playerState.parts.length">
          <div class="section-row">
            <p class="section">部件</p>
            <button type="button" class="text-btn" @click="resetParts">恢复默认</button>
          </div>
          <div v-for="part in playerState.parts" :key="part.id" class="param-row">
            <div class="param-label">
              <span :title="part.id">{{ part.name }}</span>
              <span>{{ part.value }}%</span>
            </div>
            <el-slider
              :model-value="part.value"
              :min="0"
              :max="100"
              :step="1"
              :show-tooltip="false"
              @input="onPart(part.id, $event)"
            />
          </div>
        </section>

        <section v-if="playerState.hitAreas.length">
          <p class="section">命中判定</p>
          <div class="chips">
            <span v-for="name in playerState.hitAreas" :key="name" class="hit">{{ name }}</span>
          </div>
        </section>
      </div>
      <p v-else class="models-empty">选择左侧模型</p>
    </el-card>
  </section>
</template>

<style scoped>
.preview {
  height: 100%;
  display: flex;
  gap: 16px;
  min-width: 0;
  animation: rise 0.45s ease both;
}

.panel.params {
  width: 360px;
}

.panel {
  width: 300px;
  flex: none;
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-light);
}

.panel :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.panel :deep(.el-select) {
  width: 100%;
}

.actions {
  display: flex;
  gap: 8px;
}

.models {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.models-empty {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.models ul {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.models button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 6px 6px 12px;
  text-align: left;
  font: inherit;
  font-size: 13px;
  color: inherit;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  cursor: pointer;
}

.model-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-ops {
  display: flex;
  flex: none;
  align-items: center;
}

.model-ops > span {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 4px;
  color: #5d7282;
}

.model-ops > span:hover {
  background: #eef3f6;
}

.model-ops .export {
  color: #2b6cb0;
}

.model-ops .danger {
  color: #c4533c;
}

.model-ops svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.models button.on,
.models button:hover {
  border-color: #1e5168;
}

.models button.busy {
  color: #5d7282;
}

.models button:focus-visible {
  outline: 2px solid #1e5168;
  outline-offset: 3px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.inspector {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.section {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.12em;
  color: #3e5566;
}

.section-row .section {
  margin: 0;
}

.group-name {
  margin: 10px 0 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.param-label {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  line-height: 1.4;
}

.param-label span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.param-row :deep(.el-slider) {
  --el-slider-height: 6px;
  --el-slider-button-size: 14px;
  --el-slider-button-wrapper-size: 14px;
  --el-slider-button-wrapper-offset: -4px;
  height: 22px;
}

.param-row :deep(.el-slider__button-wrapper) {
  display: flex;
  align-items: center;
  justify-content: center;
}

.param-row :deep(.el-slider__button-wrapper::after) {
  content: none;
}

.param-row :deep(.el-slider__button) {
  display: block;
}

.switches {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
}

.switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.text-btn {
  padding: 0;
  border: 0;
  background: none;
  color: #1e5168;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.text-btn:focus-visible {
  outline: 2px solid #1e5168;
  outline-offset: 2px;
}

.hit {
  padding: 2px 8px;
  font-size: 12px;
  color: #3e5566;
  background: #eef3f6;
  border-radius: 999px;
}

.stage {
  flex: 1;
  min-width: 0;
  position: relative;
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--el-border-radius-base);
  animation: rise 0.45s ease 0.06s both;
  background-color: var(--el-fill-color-light);
  background-image:
    linear-gradient(45deg, var(--el-fill-color) 25%, transparent 25%),
    linear-gradient(-45deg, var(--el-fill-color) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--el-fill-color) 75%),
    linear-gradient(-45deg, transparent 75%, var(--el-fill-color) 75%);
  background-size: 28px 28px;
  background-position:
    0 0,
    0 14px,
    14px -14px,
    -14px 0;
  overflow: hidden;
}

.stage canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .preview,
  .stage {
    animation: none;
  }
}

@keyframes rise {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}
</style>
