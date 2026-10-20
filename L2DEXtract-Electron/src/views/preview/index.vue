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
    <el-card class="panel" shadow="never">
      <template #header>
        <div class="head">
          <span>预览</span>
          <el-text type="info">选择解包后的角色目录，模型显示在右侧。</el-text>
        </div>
      </template>

      <el-form label-position="top">
        <el-form-item label="模型目录">
          <el-input v-model="folder" readonly placeholder="模型目录">
            <template #append>
              <el-button @click="pick">浏览</el-button>
            </template>
          </el-input>
        </el-form-item>
      </el-form>

      <div class="actions">
        <el-button type="primary" :loading="loading" :disabled="!folder" @click="load">加载模型</el-button>
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
        <el-text type="info">加载后在这里显示模型</el-text>
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
</style>
