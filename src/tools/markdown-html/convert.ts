/**
 * Markdown↔HTML conversion logic (pure, UI-free).
 *
 * All three third-party dependencies (marked, turndown, dompurify) are loaded
 * lazily via dynamic import on first use (platform rule: they must never enter
 * the entry bundle). Module references are cached so repeated conversions and
 * every output path share one configured instance of each library.
 *
 * Sanitization is an explicit pipeline step (see CONTEXT.md 输出净化):
 * - md→html:  marked (GFM) renders, then the output is sanitized.
 * - html→md:  the input HTML is sanitized FIRST, then turndown converts —
 *   every output path (preview/copy/download) is therefore downstream of the
 *   same sanitizer, and turndown never emits raw markup on its own.
 * Both directions use the exact same sanitize function (one DOMPurify
 * instance, default config, no raw-output bypass).
 *
 * Semantics (see .scratch/hot-tools-v0.3.0/issues/13-markdown-html-spec.md):
 * - GFM full set: tables, task list checkboxes, strikethrough, autolinks,
 *   fenced code blocks. No footnotes, no syntax highlighting — fenced code
 *   renders as bare `<pre><code>` (a custom renderer strips the language
 *   class; no highlighter is ever loaded).
 * - html→md keeps content structure (headings, lists, tables, links, images,
 *   code, quotes, emphasis); style/layout info (class/style/div wrappers) is
 *   dropped; unknown tags pass through their text content without errors.
 * - Images/links are passed through untouched: relative paths are not
 *   rewritten, `data:` URI images survive (DOMPurify default).
 */

// Type-only: never enters the bundle; the value import is dynamic (below).
import type TurndownService from 'turndown'

/** Paste (textarea) input limit in UTF-8 bytes: 1 MiB. */
export const PASTE_MAX_BYTES = 1024 * 1024

export type Direction = 'md-to-html' | 'html-to-md'

export type MarkdownHtmlErrorCode = 'empty' | 'pasteTooLarge' | 'convert'

export interface MarkdownHtmlError {
  code: MarkdownHtmlErrorCode
  /** Underlying library message, kept for the generic conversion errors. */
  message?: string
}

export type ConversionOutcome =
  | { ok: true; value: string }
  | { ok: false; errors: MarkdownHtmlError[] }

/**
 * The single sanitize step every output is routed through.
 * Real implementation: one DOMPurify instance with the default config.
 */
export type SanitizeHtml = (html: string) => string

/* ------------------------------------------------------------------ *
 * Size limits
 * ------------------------------------------------------------------ */

const encoder = new TextEncoder()

export function utf8ByteLength(text: string): number {
  return encoder.encode(text).length
}

export function isPasteWithinLimit(text: string): boolean {
  return utf8ByteLength(text) <= PASTE_MAX_BYTES
}

/* ------------------------------------------------------------------ *
 * marked (dynamic import, first use only)
 * ------------------------------------------------------------------ */

interface MarkedCodeToken {
  text: string
}

interface MarkedInstanceOptions {
  gfm?: boolean
  breaks?: boolean
  /** Partial renderer override, merged by marked. */
  renderer?: {
    code(token: MarkedCodeToken): string
  }
}

interface MarkedStatic {
  parse(src: string): string
}

type MarkedConstructor = new (options?: MarkedInstanceOptions) => MarkedStatic

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

let cachedMarked: MarkedStatic | null = null

async function loadMarked(): Promise<MarkedStatic> {
  if (cachedMarked) return cachedMarked
  const { Marked } = (await import('marked')) as unknown as {
    Marked: MarkedConstructor
  }
  cachedMarked = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      // Bare <pre><code>: no language class, no highlighter (spec §1).
      code(token: MarkedCodeToken): string {
        return `<pre><code>${escapeHtmlText(token.text)}</code></pre>`
      },
    },
  })
  return cachedMarked
}

/* ------------------------------------------------------------------ *
 * turndown + gfm plugin (dynamic import, first use only)
 * ------------------------------------------------------------------ */

let cachedTurndown: TurndownService | null = null

async function loadTurndownService(): Promise<TurndownService> {
  if (cachedTurndown) return cachedTurndown
  const [{ default: TurndownServiceCtor }, { gfm }] = await Promise.all([
    import('turndown'),
    import('turndown-plugin-gfm'),
  ])
  const service = new TurndownServiceCtor({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  })
  // GFM tables + strikethrough + task list items (see src/types/vendor.d.ts).
  service.use(gfm)
  // marked wraps the checkbox in <p> inside loose list items
  // (`<li><p><input type="checkbox"> …</p></li>`), but the gfm plugin only
  // matches inputs whose direct parent is <li>, so those checkboxes would be
  // dropped. Supplementary rule: same replacement, any depth inside an <li>.
  service.addRule('taskListItemLooseList', {
    filter(node) {
      if (node.nodeName !== 'INPUT') return false
      if ((node as HTMLInputElement).type !== 'checkbox') return false
      let parent = node.parentNode
      while (parent) {
        if (parent.nodeName === 'LI') return true
        parent = parent.parentNode
      }
      return false
    },
    replacement(_content, node) {
      return ((node as HTMLInputElement).checked ? '[x]' : '[ ]') + ' '
    },
  })
  cachedTurndown = service
  return service
}

/* ------------------------------------------------------------------ *
 * DOMPurify sanitize step (dynamic import, first use only)
 * ------------------------------------------------------------------ */

interface DOMPurifyLike {
  /** Present in DOM runtimes; absent in the node fallback instance. */
  sanitize?: (dirty: string) => string
}

let cachedSanitize: SanitizeHtml | null = null

/**
 * Loads DOMPurify (dynamic import, first use) and returns THE shared sanitize
 * step used by every output path. In a DOM-less runtime (vitest node env)
 * DOMPurify instantiates without `sanitize`; the step degrades to identity so
 * the pipeline shape stays testable — tests inject an assertable stub and the
 * browser runtime performs the real sanitization through this same function.
 */
export async function loadSanitizer(): Promise<SanitizeHtml> {
  if (cachedSanitize) return cachedSanitize
  const { default: DOMPurify } = (await import('dompurify')) as {
    default: DOMPurifyLike
  }
  const sanitize = DOMPurify.sanitize
  cachedSanitize =
    typeof sanitize === 'function'
      ? (html) => sanitize(html)
      : (html) => html
  return cachedSanitize
}

/* ------------------------------------------------------------------ *
 * Pipelines
 * ------------------------------------------------------------------ */

export async function mdToHtml(
  markdown: string,
  sanitize?: SanitizeHtml,
): Promise<ConversionOutcome> {
  if (markdown.trim() === '') {
    return { ok: false, errors: [{ code: 'empty' }] }
  }
  const [marked, purify] = await Promise.all([
    loadMarked(),
    sanitize ? Promise.resolve(sanitize) : loadSanitizer(),
  ])

  let raw: string
  try {
    raw = marked.parse(markdown)
  } catch (caught) {
    return { ok: false, errors: [{ code: 'convert', message: errorMessage(caught) }] }
  }
  return { ok: true, value: purify(raw) }
}

export async function htmlToMarkdown(
  html: string,
  sanitize?: SanitizeHtml,
): Promise<ConversionOutcome> {
  if (html.trim() === '') {
    return { ok: false, errors: [{ code: 'empty' }] }
  }
  const [service, purify] = await Promise.all([
    loadTurndownService(),
    sanitize ? Promise.resolve(sanitize) : loadSanitizer(),
  ])

  // Sanitize the input first: the conversion output (and every output path
  // built on it) is downstream of the same sanitizer, and turndown never
  // has to see executable markup.
  const clean = purify(html)

  try {
    return { ok: true, value: service.turndown(clean) }
  } catch (caught) {
    return { ok: false, errors: [{ code: 'convert', message: errorMessage(caught) }] }
  }
}

export async function convert(
  text: string,
  direction: Direction,
  sanitize?: SanitizeHtml,
): Promise<ConversionOutcome> {
  if (text.trim() === '') {
    return { ok: false, errors: [{ code: 'empty' }] }
  }
  if (!isPasteWithinLimit(text)) {
    return { ok: false, errors: [{ code: 'pasteTooLarge' }] }
  }
  return direction === 'md-to-html' ? mdToHtml(text, sanitize) : htmlToMarkdown(text, sanitize)
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught)
}
