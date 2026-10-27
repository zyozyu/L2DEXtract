import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useOutputStore = defineStore('output', () => {
  const outputDir = ref('')
  let pending: Promise<string> | null = null

  function ensure() {
    if (outputDir.value) return Promise.resolve(outputDir.value)
    if (!pending) {
      pending = window.api.defaultOutput().then((dir) => {
        if (!outputDir.value) outputDir.value = dir
        return outputDir.value
      })
    }
    return pending
  }

  return { outputDir, ensure }
})
