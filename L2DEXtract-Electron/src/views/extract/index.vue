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
    <el-row :gutter="16" class="grid">
      <el-col :span="14" class="col">
        <el-card class="panel" shadow="never">
          <template #header>
            <div class="head">
              <span>解包</span>
              <el-text type="info">选择 LPK。工坊包如果旁边有 config.json，会自动填上。</el-text>
            </div>
          </template>

          <div class="drop" :class="{ hot: dragging }">把 .lpk 或 config.json 拖到这里</div>

          <el-form label-position="top">
            <el-form-item label="LPK 文件">
              <el-input v-model="lpk" readonly placeholder="选择 .lpk">
                <template #append>
                  <el-button @click="pickLpk">浏览</el-button>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item label="config.json">
              <el-input v-model="configPath" readonly placeholder="STD 包可以留空，工坊包需要">
                <template #append>
                  <el-button @click="pickConfig">浏览</el-button>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item label="输出目录">
              <el-input v-model="outputDir" readonly placeholder="输出目录">
                <template #append>
                  <el-button @click="pickOutput">浏览</el-button>
                </template>
              </el-input>
            </el-form-item>
          </el-form>

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
            :status="!running && progress === 100 ? 'success' : undefined"
          />
        </el-card>
      </el-col>

      <el-col :span="10" class="col">
        <el-card class="panel" shadow="never">
          <template #header>日志</template>
          <div ref="logEl" class="log">
            <el-text v-if="logs.length === 0" type="info">日志会显示在这里。</el-text>
            <p v-for="(line, index) in logs" :key="index">{{ line }}</p>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </section>
</template>

<style scoped>
.extract {
  height: 100%;
  min-width: 0;
}

.grid,
.col {
  height: 100%;
}

.panel {
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
  gap: 16px;
}

.head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.drop {
  border: 1px dashed var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  padding: 28px 16px;
  text-align: center;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-blank);
}

.drop.hot {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.actions {
  display: flex;
  gap: 8px;
}

.log {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-light);
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.log p {
  margin: 0;
}
</style>
