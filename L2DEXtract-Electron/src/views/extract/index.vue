<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const lpk = ref('')
const configPath = ref('')
const outputDir = ref('')
const logs = ref<string[]>([])
const running = ref(false)
const progress = ref(0)
const dragging = ref(false)
const previewDir = ref('')
const logEl = ref<HTMLElement | null>(null)

let stopLog = () => {}
let stopFileId = () => {}

onMounted(async () => {
  outputDir.value = await window.api.defaultOutput()
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
  stopLog()
  stopFileId()
})

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
  if (event.dataTransfer?.types.includes('Files')) dragging.value = true
}

function onDragLeave() {
  dragging.value = false
}

function onDrop(event: DragEvent) {
  dragging.value = false
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
  if (running.value) return
  logs.value = []
  progress.value = 0
  previewDir.value = ''
  running.value = true
  try {
    const result = await window.api.extract({
      lpkPath: lpk.value,
      configPath: configPath.value,
      outputDir: outputDir.value,
    })
    progress.value = 100
    previewDir.value = result.characterDirs[0] ?? result.outputDir
    const count = result.characterDirs.length
    ElMessage.success(count > 1 ? `解包完成，共 ${count} 个角色目录` : '解包完成')
  } catch (error) {
    progress.value = 0
    ElMessageBox.alert(errorText(error), '解包失败', { confirmButtonText: '知道了' })
  } finally {
    running.value = false
  }
}

async function openOutput() {
  try {
    await window.api.openPath(outputDir.value)
  } catch (error) {
    ElMessage.warning(errorText(error))
  }
}

function goPreview() {
  if (!previewDir.value) return
  void router.push({ path: '/preview', query: { dir: previewDir.value } })
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
</script>

<template>
  <section
    class="extract"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <header>
      <h1>解包</h1>
      <p>选择 LPK。工坊包如果旁边有 config.json，会自动填上。</p>
    </header>

    <div class="drop" :class="{ hot: dragging }">把 .lpk 或 config.json 拖到这里</div>

    <div class="field">
      <span>LPK 文件</span>
      <div class="row">
        <el-input v-model="lpk" readonly placeholder="选择 .lpk" />
        <el-button @click="pickLpk">浏览</el-button>
      </div>
    </div>
    <div class="field">
      <span>config.json</span>
      <div class="row">
        <el-input v-model="configPath" readonly placeholder="STD 包可以留空，工坊包需要" />
        <el-button @click="pickConfig">浏览</el-button>
      </div>
    </div>
    <div class="field">
      <span>输出目录</span>
      <div class="row">
        <el-input v-model="outputDir" readonly placeholder="输出目录" />
        <el-button @click="pickOutput">浏览</el-button>
      </div>
    </div>

    <div class="actions">
      <el-button type="primary" :loading="running" @click="start">开始解包</el-button>
      <el-button :disabled="!outputDir" @click="openOutput">打开输出目录</el-button>
      <el-button v-if="previewDir" @click="goPreview">预览模型</el-button>
    </div>

    <el-progress
      v-if="running || progress === 100"
      :percentage="running ? 100 : progress"
      :indeterminate="running"
      :stroke-width="8"
    />

    <div ref="logEl" class="log">
      <p v-if="logs.length === 0">日志会显示在这里。</p>
      <p v-for="(line, index) in logs" :key="index">{{ line }}</p>
    </div>
  </section>
</template>

<style scoped>
.extract {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 28px 32px 24px;
  min-width: 0;
}

header h1 {
  margin: 0;
  font-size: 28px;
  letter-spacing: -0.04em;
}

header p {
  margin: 6px 0 0;
  color: #5c6b7c;
}

.drop {
  border: 1.5px dashed #b7c5d4;
  border-radius: 12px;
  padding: 18px;
  text-align: center;
  color: #5c6b7c;
  background: #f7f9fc;
}

.drop.hot {
  border-color: #e85d4c;
  color: #e85d4c;
  background: #fdf0ee;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field span {
  font-size: 13px;
  font-weight: 600;
}

.row {
  display: flex;
  gap: 8px;
}

.row .el-input {
  flex: 1;
}

.actions {
  display: flex;
  gap: 8px;
}

.log {
  flex: 1;
  min-height: 180px;
  overflow: auto;
  margin: 0;
  padding: 14px 16px;
  border-radius: 12px;
  background: #1c2430;
  color: #d5deea;
  font-family: 'Cascadia Code', 'Sarasa Mono SC', ui-monospace, monospace;
  font-size: 12px;
  line-height: 1.55;
}

.log p {
  margin: 0;
}
</style>
