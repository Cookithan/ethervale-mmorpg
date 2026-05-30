import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: true, // accessible depuis le mobile sur le même réseau
    port: 5173,
  },
  // Phaser est volumineux : on le sort dans son propre chunk
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
})
