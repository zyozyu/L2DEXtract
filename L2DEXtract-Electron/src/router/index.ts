import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '@/views/home/index.vue'
import ExtractView from '@/views/extract/index.vue'
import PreviewView from '@/views/preview/index.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/extract', name: 'extract', component: ExtractView },
    { path: '/preview', name: 'preview', component: PreviewView },
  ],
})

export default router
