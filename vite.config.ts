import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// Tauri CLI sets TAURI_ENV_FAMILY (and related TAURI_ENV_*) inside `tauri dev`
// and `tauri build`. When present we use a relative base so HTML / JS / CSS /
// icon / WASM assets resolve against the Tauri local asset protocol
// (tauri://localhost/...). The web build under `/forge-x/` is preserved
// for browser deployment. Older Tauri 1 builds set TAURI_FAMILY; support
// both for safety.
const isTauri = !!(
  process.env.TAURI_ENV_FAMILY ||
  process.env.TAURI_FAMILY ||
  process.env.TAURI_ENV_PLATFORM
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5175,
    strictPort: true,
  },
  base: isTauri ? './' : '/forge-x/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})