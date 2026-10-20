import { createRouter, createWebHashHistory } from 'vue-router'
import ExtractView from '@/views/extract/index.vue'
import PreviewView from '@/views/preview/index.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/extract' },
    { path: '/extract', name: 'extract', component: ExtractView },
    { path: '/preview', name: 'preview', component: PreviewView },
  ],
})

export default router
