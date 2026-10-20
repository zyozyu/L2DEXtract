<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'

const route = useRoute()
const folder = ref('')
const pageUrl = ref('')
const loading = ref(false)

onMounted(() => {
  void ensureServer()
})

watch(
  () => route.query.dir,
  (dir) => {
    if (typeof dir === 'string' && dir) {
      folder.value = dir
      void load()
    }
  },
  { immediate: true },
)

async function ensureServer() {
  if (pageUrl.value) return
  const info = await window.api.startPreview()
  pageUrl.value = info.pageUrl
}

async function pick() {
  const dir = await window.api.selectDirectory()
  if (!dir) return
  folder.value = dir
  await load()
}

async function load() {
  if (!folder.value || loading.value) return
  loading.value = true
  try {
    await ensureServer()
    await wait(400)
    let result = await window.api.loadModel(folder.value)
    for (let attempt = 0; attempt < 5 && result.clients <= 0; attempt++) {
      await wait(1000)
      result = await window.api.loadModel(folder.value)
    }
    if (result.clients <= 0) ElMessage.warning('预览页还没连上，再点一次加载')
    else ElMessage.success('模型已加载')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    loading.value = false
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function openBrowser() {
  try {
    await window.api.openPreviewInBrowser()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}
</script>

<template>
  <section class="preview">
    <aside>
      <h1>预览</h1>
      <p>选择解包后的角色目录，模型会显示在右侧。</p>
      <el-input v-model="folder" readonly placeholder="模型目录" />
      <el-button @click="pick">选择目录</el-button>
      <el-button type="primary" :loading="loading" :disabled="!folder" @click="load">加载模型</el-button>
      <el-button @click="openBrowser">在浏览器打开</el-button>
    </aside>
    <div class="stage">
      <iframe v-if="pageUrl" :src="pageUrl" title="Live2D 预览" />
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

.stage {
  flex: 1;
  min-width: 0;
  background: #d5dde8;
}

iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: #d5dde8;
}
</style>
