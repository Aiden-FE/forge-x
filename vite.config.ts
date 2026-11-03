import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { VENDOR_CHUNK_MAP } from './scripts/vendor-chunks.mjs'

const vendorChunks: Record<string, string | undefined> = VENDOR_CHUNK_MAP

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

// Named vendor chunks keep third-party deps out of the first-screen closure
// and let scripts/check-bundle-budgets.mjs attribute per-lib gzip budgets
// (v0.4.0 spec appendix §1: on-demand ≤50 KB, sql-formatter exempt ≤80 KB).
// The map lives in scripts/vendor-chunks.mjs so the budget gate can't drift.

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // Windows rolldown ids use backslashes — normalize before matching.
          const normalized = id.replaceAll('\\', '/')
          if (!normalized.includes('/node_modules/')) return undefined
          // pnpm layout nests deps under node_modules/.pnpm/<pkg>@ver/node_modules/<pkg>/ —
          // the LAST node_modules/<pkg> segment is the real package id.
          const matches = [...normalized.matchAll(/node_modules\/((?:@[^/]+\/)?[^/]+)\//g)]
          const last = matches[matches.length - 1]
          if (!last) return undefined
          if (process.env.DEBUG_CHUNKS) console.error('[manualChunks]', last[1])
          return vendorChunks[last[1]]
        },
      },
    },
  },
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
