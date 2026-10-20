import { fileURLToPath, URL } from 'node:url'
import { dirname, resolve } from 'node:path'

import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ['adm-zip', 'ws'],
      },
      rollupOptions: {
        input: {
          index: resolve(root, 'electron/main/index.ts'),
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(root, 'electron/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    root,
    build: {
      rollupOptions: {
        input: {
          index: resolve(root, 'index.html'),
        },
      },
    },
    plugins: [vue(), vueDevTools()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  },
})
