import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cfg = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'))
const caps = JSON.parse(readFileSync(resolve(root, 'src-tauri/capabilities/default.json'), 'utf8'))
const css = readFileSync(resolve(root, 'src/styles/variables.css'), 'utf8')
const html = readFileSync(resolve(root, 'index.html'), 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(cfg.productName === 'ForgeX', 'unexpected product name')
assert(cfg.bundle.active, 'bundling must be active')
assert(cfg.bundle.windows.nsis.installMode === 'currentUser', 'NSIS must install for current user')
assert(cfg.bundle.windows.webviewInstallMode.type === 'downloadBootstrapper', 'WebView2 bootstrapper policy changed')
assert(cfg.bundle.macOS.minimumSystemVersion === '14.0', 'macOS minimum changed')
assert(cfg.bundle.macOS.signingIdentity === '-', 'macOS bundle must use ad-hoc signing identity')
assert(cfg.app.security.csp.includes("'wasm-unsafe-eval'"), 'WebP WASM CSP permission missing')
assert(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(css), 'remote fonts remain')
assert(html.includes('href="./favicon.svg"'), 'desktop favicon must be relative')
assert(caps.windows?.length === 1 && caps.windows[0] === 'main', 'capability window scope changed')
assert(caps.permissions.length === 1 && caps.permissions[0] === 'core:default', 'unexpected native permissions')
console.log('release configuration verified')
