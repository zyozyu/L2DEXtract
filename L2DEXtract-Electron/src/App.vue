<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="shell">
    <aside class="nav">
      <div class="mark">L2DEXtract</div>
      <nav>
        <RouterLink to="/extract">解包</RouterLink>
        <RouterLink to="/preview">预览</RouterLink>
      </nav>
    </aside>
    <main>
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.shell {
  height: 100%;
  display: flex;
  background: #e6edf4;
  color: #1c2430;
}

.nav {
  width: 168px;
  flex: none;
  padding: 28px 16px;
  display: flex;
  flex-direction: column;
}

.mark {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.04em;
  margin-bottom: 28px;
}

nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

nav a {
  padding: 10px 12px;
  border-radius: 10px;
  color: inherit;
  text-decoration: none;
  font-weight: 600;
}

nav a.router-link-active {
  background: #f7f9fc;
  color: #e85d4c;
}

main {
  flex: 1;
  min-width: 0;
}
</style>
