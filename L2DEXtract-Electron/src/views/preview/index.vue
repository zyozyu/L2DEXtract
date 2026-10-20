<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Live2dPlayer, type Live2dPlayerState } from '@/live2d/player'
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
  posX: 0,
  posY: 0,
  scalePct: 100,
  rotation: 0,
  opacityPct: 100,
  ready: false,
})

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

const current = computed(() => models.value.find((model) => modelKey(model) === activeKey.value) ?? null)

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

async function saveAsModel() {
  const model = current.value
  if (!model) return
  try {
    const dest = await window.api.saveModelAs(model.dir)
    if (!dest) return
    ElMessage.success('已另存')
    if (outputDir.value) await scan(outputDir.value, false)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

async function removeModel() {
  const model = current.value
  if (!model) return
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

function onExpression(value: string | number | boolean | undefined) {
  player?.setExpression(typeof value === 'string' ? value : '')
}
</script>

<template>
  <section class="preview">
    <el-card class="panel" shadow="never">
      <template #header>
        <div class="head">
          <span>预览</span>
          <el-text type="info">按导出路径列出模型，点一下切换。</el-text>
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
        <p class="models-label">模型</p>
        <p v-if="!models.length" class="models-empty">这个目录里没有模型</p>
        <ul v-else>
          <li v-for="model in models" :key="modelKey(model)">
            <button
              type="button"
              :class="{ on: activeKey === modelKey(model), busy: loading && activeKey === modelKey(model) }"
              :title="`${model.dir}\\${model.file}`"
              @click="openModel(model)"
            >
              {{ model.name }}
            </button>
          </li>
        </ul>
        <div v-if="current" class="actions">
          <el-button @click="saveAsModel">另存为</el-button>
          <el-button type="danger" plain @click="removeModel">删除</el-button>
        </div>
      </div>

      <template v-if="playerState.modelName">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="模型">{{ playerState.modelName }}</el-descriptions-item>
        </el-descriptions>

        <el-form label-position="top">
          <el-form-item label="表情">
            <el-select
              v-model="playerState.currentExpression"
              clearable
              placeholder="无"
              @change="onExpression"
            >
              <el-option v-for="name in playerState.expressions" :key="name" :label="name" :value="name" />
            </el-select>
          </el-form-item>
          <el-form-item label="动作">
            <div class="motions">
              <el-button
                v-for="name in playerState.motions"
                :key="name"
                size="small"
                :type="playerState.currentMotion === name ? 'primary' : 'default'"
                @click="player?.playMotion(name)"
              >
                {{ name }}
              </el-button>
              <el-text v-if="!playerState.motions.length" type="info" size="small">无动作</el-text>
            </div>
          </el-form-item>
          <el-form-item :label="`缩放 ${playerState.scalePct}%`">
            <el-slider v-model="playerState.scalePct" :min="10" :max="300" @input="onTransform" />
          </el-form-item>
          <el-form-item :label="`透明度 ${playerState.opacityPct}%`">
            <el-slider v-model="playerState.opacityPct" :min="10" :max="100" @input="onTransform" />
          </el-form-item>
        </el-form>

        <div class="actions">
          <el-button @click="player?.autoFit()">自适应</el-button>
        </div>
      </template>
    </el-card>

    <div ref="stageRef" class="stage">
      <canvas ref="canvasRef" />
      <div v-if="!playerState.modelName" class="hint">
        <el-text type="info">{{ outputDir ? '选择左侧模型' : '先选择导出路径' }}</el-text>
      </div>
    </div>
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

.panel {
  width: 320px;
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

.models-label {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.12em;
  color: #3e5566;
}

.models-empty {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.models ul {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.models button {
  width: 100%;
  padding: 10px 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  font: inherit;
  font-size: 13px;
  color: inherit;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  cursor: pointer;
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

.motions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
