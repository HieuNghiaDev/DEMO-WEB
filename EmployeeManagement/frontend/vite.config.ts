import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  // Windows/antivirus can keep optimized dependency files locked after Vite exits.
  // A cache per process avoids deleting a directory that another process still holds.
  cacheDir: `.vite-cache/${process.pid}`,

  base: command === 'build' ? '/DEMO-WEB/' : '/',
}))
