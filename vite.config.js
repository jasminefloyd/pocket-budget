import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/pocket-budget/",
  build: {
    sourcemap: false, // Disable sourcemaps to avoid deployment issues
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  define: {
    global: "globalThis",
  },
})
