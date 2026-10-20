<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <el-container class="shell">
    <el-header class="header">
      <RouterLink to="/" class="brand">L2DEXtract</RouterLink>
      <el-menu
        mode="horizontal"
        :default-active="route.path"
        :key="route.path"
        router
        :ellipsis="false"
      >
        <el-menu-item index="/">首页</el-menu-item>
        <el-menu-item index="/extract">解包</el-menu-item>
        <el-menu-item index="/preview">预览</el-menu-item>
      </el-menu>
    </el-header>
    <el-main class="main">
      <RouterView />
    </el-main>
  </el-container>
</template>

<style scoped>
.shell {
  height: 100%;
}

.header {
  display: flex;
  align-items: center;
  gap: 28px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
}

.brand {
  flex: none;
  font-size: 18px;
  font-weight: 700;
  color: var(--el-color-primary);
  text-decoration: none;
}

.header :deep(.el-menu--horizontal) {
  flex: 1;
  border-bottom: none;
  background: transparent;
}

.main {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 16px;
  background: var(--el-bg-color-page);
  overflow: hidden;
}

.main > :deep(*) {
  flex: 1;
  min-height: 0;
}
</style>
