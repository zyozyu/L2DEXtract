import { createRouter, createWebHashHistory } from 'vue-router'
import ExtractView from '@/views/ExtractView.vue'
import PreviewView from '@/views/PreviewView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/extract' },
    { path: '/extract', name: 'extract', component: ExtractView },
    { path: '/preview', name: 'preview', component: PreviewView },
  ],
})

export default router
