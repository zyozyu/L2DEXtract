<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Live2dPlayer, type Live2dPlayerState } from '@/live2d/player'

const route = useRoute()
const folder = ref('')
const loading = ref(false)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)

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
    const dir = route.query.dir
    if (typeof dir === 'string' && dir) {
      folder.value = dir
      await load()
    }
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
  () => route.query.dir,
  (dir) => {
    if (typeof dir === 'string' && dir && playerState.ready) {
      folder.value = dir
      void load()
    }
  },
)

async function pick() {
  const dir = await window.api.selectDirectory()
  if (!dir) return
  folder.value = dir
  await load()
}

async function load() {
  if (!folder.value || loading.value || !player) return
  loading.value = true
  try {
    await window.api.startPreview()
    const result = await window.api.loadModel(folder.value)
    await player.loadModel(result.modelUrl)
    ElMessage.success('模型已加载')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    loading.value = false
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
    <aside>
      <h1>预览</h1>
      <p>选择解包后的角色目录，模型显示在右侧。</p>
      <el-input v-model="folder" readonly placeholder="模型目录" />
      <el-button @click="pick">选择目录</el-button>
      <el-button type="primary" :loading="loading" :disabled="!folder" @click="load">加载模型</el-button>

      <template v-if="playerState.modelName">
        <div class="block">
          <label>模型</label>
          <div class="meta">{{ playerState.modelName }}</div>
        </div>
        <div class="block">
          <label>表情</label>
          <el-select
            v-model="playerState.currentExpression"
            clearable
            placeholder="无"
            @change="onExpression"
          >
            <el-option v-for="name in playerState.expressions" :key="name" :label="name" :value="name" />
          </el-select>
        </div>
        <div class="block">
          <label>动作</label>
          <div class="motions">
            <button
              v-for="name in playerState.motions"
              :key="name"
              type="button"
              :class="{ active: playerState.currentMotion === name }"
              @click="player?.playMotion(name)"
            >
              {{ name }}
            </button>
            <span v-if="!playerState.motions.length" class="empty">无动作</span>
          </div>
        </div>
        <div class="block">
          <label>缩放 {{ playerState.scalePct }}%</label>
          <el-slider v-model="playerState.scalePct" :min="10" :max="300" @input="onTransform" />
        </div>
        <div class="block">
          <label>透明度 {{ playerState.opacityPct }}%</label>
          <el-slider v-model="playerState.opacityPct" :min="10" :max="100" @input="onTransform" />
        </div>
        <el-button @click="player?.autoFit()">自适应</el-button>
      </template>
    </aside>
    <div ref="stageRef" class="stage">
      <canvas ref="canvasRef" />
    </div>
  </section>
</template>

<style scoped>
.preview {
  height: 100%;
  display: flex;
  min-width: 0;
}

aside {
  width: 280px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 28px 20px;
  border-right: 1px solid #d3deea;
  overflow: auto;
}

aside h1 {
  margin: 0;
  font-size: 28px;
  letter-spacing: -0.04em;
}

aside p {
  margin: 0 0 8px;
  color: #5c6b7c;
  line-height: 1.5;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.block label {
  font-size: 12px;
  color: #5c6b7c;
  font-weight: 600;
}

.meta {
  font-size: 13px;
  word-break: break-all;
}

.motions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.motions button {
  border: 1px solid #c9d5e3;
  background: #f7f9fc;
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
}

.motions button.active {
  border-color: #e85d4c;
  color: #e85d4c;
}

.empty {
  font-size: 12px;
  color: #8a97a8;
}

.stage {
  flex: 1;
  min-width: 0;
  background: #d5dde8;
  position: relative;
}

.stage canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
