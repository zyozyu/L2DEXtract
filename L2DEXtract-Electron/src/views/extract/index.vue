<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { useOutputStore } from '@/stores/output'

const router = useRouter()
const { outputDir } = storeToRefs(useOutputStore())
const lpk = ref('')
const configPath = ref('')
const logs = ref<string[]>([])
const running = ref(false)
const leaving = ref(false)
const dragging = ref(false)
const step = ref(0)
const logEl = ref<HTMLElement | null>(null)

const steps = [
  { label: '导入', hint: '选择或拖入 .lpk。工坊包再带上 config.json。' },
  { label: '导出路径', hint: '模型会写到这个目录。' },
  { label: '开始解包', hint: '确认文件和路径后开始。' },
  { label: '完成', hint: '接着去预览。' },
]

const fill = computed(() => {
  if (step.value >= 3) return 100
  if (running.value) return 82
  return (step.value / 3) * 100
})

let stopLog = () => {}
let stopFileId = () => {}
let alive = true

onMounted(async () => {
  await useOutputStore().ensure()
  stopLog = window.api.onExtractLog((line) => {
    logs.value.push(line)
    void nextTick(() => {
      if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
    })
  })
  stopFileId = window.api.onNeedFileId((respond) => {
    ElMessageBox.prompt(
      '自动识别 fileId 失败。工坊文件的 ID 一般是 steamapps/workshop/content/616720/ 下面的数字目录名。',
      '需要 fileId',
      {
        confirmButtonText: '继续',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: 'fileId 不能为空',
      },
    )
      .then(({ value }) => respond(value.trim()))
      .catch(() => respond(''))
  })
})

onUnmounted(() => {
  alive = false
  stopLog()
  stopFileId()
})

function baseName(filePath: string) {
  return filePath.split(/[/\\]/).pop() ?? filePath
}

function nodeClass(index: number) {
  if (index < step.value) return 'done'
  if (index === step.value) return 'current'
  return 'wait'
}

function canOpen(index: number) {
  return !running.value && !leaving.value && index <= step.value && index < 3
}

function goto(index: number) {
  if (!canOpen(index) || index === step.value) return
  step.value = index
}

function next() {
  if (running.value || leaving.value) return
  if (step.value === 0 && !lpk.value) return
  if (step.value === 1 && !outputDir.value) return
  if (step.value < 2) step.value += 1
}

async function applyLpk(filePath: string) {
  lpk.value = filePath
  const suggested = await window.api.suggestConfig(filePath)
  if (suggested) configPath.value = suggested
}

async function pickLpk() {
  const filePath = await window.api.selectLpk()
  if (filePath) await applyLpk(filePath)
}

async function pickConfig() {
  const filePath = await window.api.selectConfig()
  if (filePath) configPath.value = filePath
}

async function pickOutput() {
  const dir = await window.api.selectDirectory()
  if (dir) outputDir.value = dir
}

function onDragOver(event: DragEvent) {
  if (running.value || leaving.value) return
  if (event.dataTransfer?.types.includes('Files')) dragging.value = true
}

function onDragLeave() {
  dragging.value = false
}

function onDrop(event: DragEvent) {
  dragging.value = false
  if (running.value || leaving.value) return
  const files = event.dataTransfer?.files
  if (!files) return
  for (const file of Array.from(files)) {
    const filePath = window.api.getPathForFile(file)
    const base = filePath.split(/[/\\]/).pop()?.toLowerCase() ?? ''
    if (base.endsWith('.lpk')) void applyLpk(filePath)
    else if (base === 'config.json') configPath.value = filePath
  }
}

async function start() {
  if (running.value || leaving.value || !lpk.value || !outputDir.value) return
  logs.value = []
  running.value = true
  try {
    const result = await window.api.extract({
      lpkPath: lpk.value,
      configPath: configPath.value,
      outputDir: outputDir.value,
    })
    leaving.value = true
    step.value = 3
    running.value = false
    await new Promise((resolve) => setTimeout(resolve, 640))
    if (!alive) return
    await router.push({ path: '/preview', query: { output: result.outputDir } })
  } catch (error) {
    ElMessageBox.alert(
      h('div', { style: 'white-space:pre-wrap;line-height:1.6' }, [
        errorText(error),
        '',
        '工坊包自动解密失败时需要填写 fileId，一般是 steamapps/workshop/content/616720/<fileId> 里的数字目录名。',
        '.wpk 需先自行解压，再解里面的 .lpk。',
        '输出目录默认是「文档/L2DEXtract」。',
      ].join('\n')),
      '解包失败',
      { confirmButtonText: '知道了' },
    )
  } finally {
    running.value = false
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
</script>

<template>
  <section class="extract" @dragover.prevent="onDragOver" @dragleave="onDragLeave" @drop.prevent="onDrop">
    <div class="flow">
      <p class="kicker">解包</p>
      <h1>四步解开</h1>

      <div class="progress">
        <div class="track" aria-hidden="true">
          <div class="fill" :class="{ busy: running }" :style="{ width: fill + '%' }"></div>
        </div>
        <ol class="rail" aria-label="解包进度">
          <li v-for="(item, index) in steps" :key="item.label">
            <button
              type="button"
              :class="nodeClass(index)"
              :disabled="!canOpen(index)"
              :aria-current="index === step ? 'step' : undefined"
              @click="goto(index)"
            >
              <span class="dot">{{ index + 1 }}</span>
              <span class="label">{{ item.label }}</span>
            </button>
          </li>
        </ol>
      </div>

      <div class="sheet">
        <h2>{{ steps[step]?.label }}</h2>
        <p class="hint">{{ steps[step]?.hint }}</p>

        <template v-if="step === 0">
          <div class="drop" :class="{ hot: dragging }">把 .lpk 或 config.json 拖到这里</div>
          <div class="file">
            <span class="file-k">.lpk</span>
            <span class="file-v" :title="lpk">{{ lpk ? baseName(lpk) : '未选择' }}</span>
            <button type="button" class="text-btn" @click="pickLpk">浏览</button>
          </div>
          <div class="file">
            <span class="file-k">config.json</span>
            <span class="file-v" :title="configPath">{{ configPath ? baseName(configPath) : 'STD 包可以留空' }}</span>
            <button type="button" class="text-btn" @click="pickConfig">浏览</button>
          </div>
          <button type="button" class="act" :disabled="!lpk" @click="next">下一步</button>
        </template>

        <template v-else-if="step === 1">
          <div class="file">
            <span class="file-v path" :title="outputDir">{{ outputDir || '未选择' }}</span>
            <button type="button" class="text-btn" @click="pickOutput">浏览</button>
          </div>
          <button type="button" class="act" :disabled="!outputDir" @click="next">下一步</button>
        </template>

        <template v-else-if="step === 2">
          <p class="picked"><code>.lpk</code> {{ baseName(lpk) }}</p>
          <p v-if="configPath" class="picked"><code>config</code> {{ baseName(configPath) }}</p>
          <p class="picked path" :title="outputDir">{{ outputDir }}</p>
          <button type="button" class="act" :disabled="running || !outputDir" @click="start">
            {{ running ? '正在解包' : '开始解包' }}
          </button>
        </template>

        <p v-else class="done-copy">解包完成，正在打开预览</p>
      </div>
    </div>

    <div class="log-wrap">
      <p class="log-title">日志</p>
      <div ref="logEl" class="log">
        <p v-if="logs.length === 0" class="log-empty">日志会显示在这里。</p>
        <p v-for="(line, index) in logs" :key="index">{{ line }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.extract {
  height: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(300px, 0.9fr);
  gap: 20px;
  min-height: 0;
  animation: rise 0.45s ease both;
}

.flow {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: 8px 12px 8px 20px;
}

.kicker,
.log-title {
  margin: 0 0 14px;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #5d7282;
}

h1 {
  margin: 0;
  font-size: 48px;
  font-weight: 650;
  line-height: 1.15;
  color: #17202b;
}

.progress {
  position: relative;
  margin-top: 32px;
}

.track {
  position: absolute;
  top: 13px;
  left: 12.5%;
  right: 12.5%;
  height: 2px;
  background: #d5e3ec;
}

.fill {
  height: 100%;
  background: #1e5168;
  transition: width 0.35s ease;
}

.fill.busy {
  background-image: linear-gradient(90deg, #1e5168 0%, #7ea8bf 50%, #1e5168 100%);
  background-size: 200% 100%;
  animation: shift 1.1s linear infinite;
}

.rail {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin: 0;
  padding: 0;
  list-style: none;
}

.rail button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: #5d7282;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.rail button:disabled {
  cursor: default;
}

.dot {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid #1e5168;
  border-radius: 50%;
  background: var(--el-bg-color-page);
  font-family: 'Cascadia Code', 'Sarasa Mono SC', ui-monospace, Consolas, monospace;
  font-size: 12px;
  color: #1e5168;
}

.rail .done {
  color: #1e5168;
}

.rail .done .dot {
  background: #1e5168;
  color: #fff;
}

.rail .current {
  font-weight: 650;
  color: #17202b;
}

.rail .current .dot {
  background: #c4533c;
  border-color: #c4533c;
  color: #fff;
}

.sheet {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 240px;
  margin-top: 28px;
  padding: 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
}

h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}

.hint,
.picked,
.done-copy,
.log-empty {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.drop {
  border: 1px dashed #1e5168;
  border-radius: var(--el-border-radius-base);
  padding: 22px 16px;
  text-align: center;
  color: #3e5566;
  background: #eef3f6;
}

.drop.hot {
  background: #d5e3ec;
  color: #1e5168;
}

.file {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.file-k {
  flex: none;
  font-family: 'Cascadia Code', 'Sarasa Mono SC', ui-monospace, Consolas, monospace;
  font-size: 12px;
  color: #1e5168;
}

.file-v,
.picked.path,
.file-v.path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-v {
  flex: 1;
  font-size: 13px;
}

.picked code {
  font-family: 'Cascadia Code', 'Sarasa Mono SC', ui-monospace, Consolas, monospace;
  font-size: 12px;
  color: #1e5168;
}

.text-btn,
.act {
  border: 0;
  background: none;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  color: #1e5168;
  cursor: pointer;
}

.text-btn {
  flex: none;
  padding: 0;
}

.act {
  align-self: flex-start;
  margin-top: 4px;
  padding: 8px 14px;
  color: #fff;
  background: #1e5168;
  border-radius: var(--el-border-radius-base);
}

.act:disabled,
.text-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.rail button:focus-visible,
.text-btn:focus-visible,
.act:focus-visible {
  outline: 2px solid #1e5168;
  outline-offset: 3px;
}

.done-copy {
  color: #1e5168;
  font-weight: 650;
}

.log-wrap {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 16px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
  animation: rise 0.45s ease 0.06s both;
}

.log {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
  border-radius: var(--el-border-radius-base);
  background: #eef3f6;
  font-family: 'Cascadia Code', 'Sarasa Mono SC', ui-monospace, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #243646;
}

.log p {
  margin: 0;
}

.log-empty {
  font-family: inherit;
}

@media (max-width: 980px) {
  .extract {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  h1 {
    font-size: 36px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .extract,
  .log-wrap,
  .fill,
  .fill.busy {
    animation: none;
    transition: none;
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

@keyframes shift {
  from {
    background-position: 100% 0;
  }

  to {
    background-position: -100% 0;
  }
}
</style>
