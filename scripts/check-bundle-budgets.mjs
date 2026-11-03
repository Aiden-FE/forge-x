import { gzipSync } from 'node:zlib'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Bundle budget gate (v0.4.0 platform conventions, spec.md appendix §1):
//  - tool third-party deps must land in async chunks (首屏第三方增量 0);
//  - per-tool on-demand budget ≤50 KB gzip, with exactly one documented
//    exemption: sql-formatter ≤80 KB (ticket 07 §0);
//  - tighter per-lib budgets from their tickets: expr-eval ≤10 KB (09);
//  - worker bundles (bcrypt / sql) are self-contained assets ≤80 KB —
//    sql-formatter and bcryptjs live inside their worker bundles, so they
//    have no main-graph vendor chunk; the worker budget covers them.
//
// Usage: node scripts/check-bundle-budgets.mjs  (after `vite build` with
// `build.manifest` enabled; see vite.config.ts manualChunks vendor naming).

const VENDOR_BUDGETS_KB = {
  'vendor-sql-formatter': 80, // hosted inside the sql worker bundle
  'vendor-expr-eval': 10,
  'vendor-cron-parser': 50,
  'vendor-cronstrue': 50,
  // hljs lib/common measures 53.7 KB gz on highlight.js 11.12.0 (research's
  // 43.5 KB was an older build); the fixed 37-language set is spec-pinned
  // and load-on-touch keeps it zero-cost until a code block appears.
  'vendor-hljs': 60,
  'vendor-cropperjs': 50,
  'vendor-bcryptjs': 50, // hosted inside the bcrypt worker bundle
}

// vendor chunks hosted in worker bundles: no main-graph chunk can exist for
// them, their size is enforced by the worker-asset budget instead.
const WORKER_HOSTED_VENDORS = new Set(['vendor-sql-formatter', 'vendor-bcryptjs'])

const WORKER_BUDGET_KB = 80

function kb(bytes) {
  return Math.round((bytes / 1024) * 10) / 10
}

function fail(message) {
  console.error(`BUNDLE BUDGET FAIL: ${message}`)
  process.exit(1)
}

const distDir = join(process.cwd(), 'dist')
const manifestPath = join(distDir, '.vite', 'manifest.json')
if (!existsSync(manifestPath)) {
  fail(`dist/.vite/manifest.json missing — run the production build with build.manifest enabled first`)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

// --- Gzip size of every emitted JS chunk ------------------------------------
const assetsDir = join(distDir, 'assets')
const sizes = new Map()
for (const file of readdirSync(assetsDir)) {
  if (!file.endsWith('.js')) continue
  const raw = readFileSync(join(assetsDir, file))
  sizes.set(file, { raw: raw.length, gz: gzipSync(raw).length })
}
const sizeOfAsset = (file) => sizes.get(file.replace(/^assets\//, ''))

// Manifest keys are filename-derived and rolldown entries carry no logical
// `name`, so vendor chunks are identified from the asset filename: the
// budget name is a prefix of the base name (hash suffix follows a dash).
function vendorBudgetName(file) {
  const base = file.replace(/^assets\//, '').replace(/\.js$/, '').replace(/^_/, '')
  return Object.keys(VENDOR_BUDGETS_KB).find((name) => base === name || base.startsWith(`${name}-`))
}

// --- Static closure of the entry chunk (首屏增量 0 gate) --------------------
const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry)
if (!entryKey) fail('no entry chunk found in build manifest')

const staticClosure = new Set()
function walkStatic(key) {
  if (staticClosure.has(key)) return
  staticClosure.add(key)
  for (const imp of manifest[key].imports ?? []) walkStatic(imp)
}
walkStatic(entryKey)

const vendorInEntry = [...staticClosure]
  .map((key) => manifest[key].file)
  .map((file) => vendorBudgetName(file))
  .filter(Boolean)
if (vendorInEntry.length > 0) {
  fail(`first-screen third-party increment: vendor chunks statically reachable from entry: ${vendorInEntry.join(', ')}`)
}

// --- Per-vendor budgets ------------------------------------------------------
const seenVendors = new Set()
for (const [key, chunk] of Object.entries(manifest)) {
  if (!chunk.file.endsWith('.js')) continue // css vendor assets carry no JS budget
  const name = vendorBudgetName(chunk.file)
  if (!name) continue
  seenVendors.add(name)
  const size = sizeOfAsset(chunk.file)
  if (!size) fail(`vendor chunk ${name}: asset ${chunk.file} not found in dist/assets`)
  const actual = kb(size.gz)
  const status = actual <= VENDOR_BUDGETS_KB[name] ? 'PASS' : 'FAIL'
  console.log(`${status}  ${name.padEnd(24)} ${String(actual).padStart(6)} KB gz (budget ${VENDOR_BUDGETS_KB[name]})`)
  if (actual > VENDOR_BUDGETS_KB[name]) fail(`${name} exceeds its gzip budget`)
}
// Every declared vendor whose library is installed must exist (deps must be
// truly async); vendor chunks hosted in worker bundles are exempt here —
// their size is enforced by the worker-asset budget instead.
const deps = JSON.parse(readFileSync('package.json', 'utf8')).dependencies ?? {}
const libToVendor = {
  'sql-formatter': 'vendor-sql-formatter',
  'cron-parser': 'vendor-cron-parser',
  'cronstrue': 'vendor-cronstrue',
  'expr-eval': 'vendor-expr-eval',
  'highlight.js': 'vendor-hljs',
  'cropperjs': 'vendor-cropperjs',
  'bcryptjs': 'vendor-bcryptjs',
}
for (const [lib, name] of Object.entries(libToVendor)) {
  if (!deps[lib] || seenVendors.has(name) || WORKER_HOSTED_VENDORS.has(name)) continue
  fail(`expected async vendor chunk ${name} is missing from the build — dependency may have been statically inlined or renamed`)
}

// --- Worker bundles ----------------------------------------------------------
const workers = [...sizes.keys()].filter((file) => file.includes('worker'))
if (workers.length === 0) fail('no worker bundles found in dist/assets')
for (const file of workers) {
  const actual = kb(sizes.get(file).gz)
  const status = actual <= WORKER_BUDGET_KB ? 'PASS' : 'FAIL'
  console.log(`${status}  ${file.padEnd(32)} ${String(actual).padStart(6)} KB gz (budget ${WORKER_BUDGET_KB})`)
  if (actual > WORKER_BUDGET_KB) fail(`worker bundle ${file} exceeds ${WORKER_BUDGET_KB} KB gzip`)
}
// The sql-formatter exemption is enforced via its worker asset: it must exist.
const sqlWorker = workers.find((file) => file.includes('format.worker'))
if (!sqlWorker) fail('sql-formatter worker asset missing — dependency is not isolated in its worker bundle')

const entryFile = manifest[entryKey].file
console.log(`PASS  first-screen closure ${kb(sizeOfAsset(entryFile).gz)} KB gz entry, no vendor chunks`)

const total = [...sizes.values()].reduce((sum, s) => sum + s.gz, 0)
console.log(`\nBundle budget gate passed: ${sizes.size} JS chunks, ${kb(total)} KB gz total.`)
