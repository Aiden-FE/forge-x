// Single source for the vendor chunk naming + gzip budgets. v0.4.0 appendix §1
// set a uniform on-demand ≤50 KB gate; v0.5.0 (spec.md 包内容「体积口径」) drops
// the uniform gate — each spec ticket now carries its own size assertion and
// those numbers are the release gate, recorded here per vendor.
// Consumed by vite.config.ts (manualChunks) and scripts/check-bundle-budgets.mjs
// so the two can't drift. bcryptjs / sql-formatter run inside worker bundles and
// have no main-graph vendor chunk — the worker ≤80 KB budget covers them.

export const VENDOR_CHUNK_MAP = {
  'sql-formatter': 'vendor-sql-formatter',
  'cron-parser': 'vendor-cron-parser',
  'cronstrue': 'vendor-cronstrue',
  'expr-eval': 'vendor-expr-eval',
  'highlight.js': 'vendor-hljs',
  'cropperjs': 'vendor-cropperjs',
  'bcryptjs': 'vendor-bcryptjs',
  // v0.5.0 additions — all first-use dynamic imports inside their tool.
  'jsonrepair': 'vendor-jsonrepair', // ticket 03
  'xml-formatter': 'vendor-xml-formatter', // ticket 04
  'fast-xml-parser': 'vendor-fast-xml-parser', // ticket 05
  'smol-toml': 'vendor-smol-toml', // ticket 10 (json-yaml TOML)
  '@scure/bip39': 'vendor-bip39', // ticket 07
  '@noble/hashes': 'vendor-bip39', // @scure/bip39's only (audited) dep — same chunk
}

export const VENDOR_BUDGETS_KB = {
  'vendor-sql-formatter': 80, // hosted inside the sql worker bundle
  'vendor-expr-eval': 10,
  'vendor-cron-parser': 50,
  'vendor-cronstrue': 50,
  // hljs lib/common measures ~54 KB gz on highlight.js 11.12.0 (research's
  // 43.5 KB was an older build); the fixed 37-language set is spec-pinned and
  // load-on-touch keeps it zero-cost until a code block appears.
  'vendor-hljs': 60,
  'vendor-cropperjs': 50,
  'vendor-bcryptjs': 50, // hosted inside the bcrypt worker bundle
  // v0.5.0 per-spec assertions (release gates, not suggestions):
  'vendor-jsonrepair': 5, // 03: measured 3.0 KB gz on jsonrepair@3.15.0
  'vendor-xml-formatter': 3, // 04: measured 2.0 KB gz on xml-formatter@3.7.0
  'vendor-fast-xml-parser': 30, // 05: fxp parser+builder combo measured 26.1 KB gz
  'vendor-smol-toml': 1.5, // 10: measured 999 B gz on smol-toml@1.9.1
  'vendor-bip39': 16, // 07: core+wordlist+noble-hashes measured ~14 KB gz + margin
}

// Worker asset budget (bcrypt / sql / regex match workers).
export const WORKER_BUDGET_KB = 80
