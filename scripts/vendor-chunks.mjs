// Single source for the v0.4.0 vendor chunk naming + gzip budgets (spec.md
// appendix §1: on-demand ≤50 KB, sql-formatter exempt ≤80 KB, expr-eval ≤10).
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
}

// Worker asset budget (bcrypt / sql / regex match workers).
export const WORKER_BUDGET_KB = 80
