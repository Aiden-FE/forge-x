import { describe, expect, it, vi } from 'vitest'
import {
  PASTE_MAX_BYTES,
  convert,
  htmlToMarkdown,
  isPasteWithinLimit,
  loadSanitizer,
  mdToHtml,
  utf8ByteLength,
} from './convert'
import type { SanitizeHtml } from './convert'

function expectOk<T extends { ok: boolean }>(outcome: T): asserts outcome is T & { ok: true } {
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
}

function errorCodesOf(outcome: { ok: boolean; errors?: Array<{ code: string }> }): string[] {
  expect(outcome.ok).toBe(false)
  return (outcome.errors ?? []).map((error) => error.code)
}

/**
 * Test double for the DOMPurify sanitize step.
 *
 * The vitest environment is plain node: DOMPurify loads but has no DOM, so it
 * cannot sanitize (see `loadSanitizer` fallback). These tests therefore pin
 * the STRUCTURAL fact — every pipeline routes its (pre-sanitize) material
 * through exactly one injected sanitize step and returns the sanitized value —
 * with a stub that mirrors DOMPurify's default decisions (script/iframe
 * removed with content, `on*` handlers stripped, `javascript:` URLs dropped).
 * Real sanitization is exercised by the browser runtime; see the report.
 */
function makeStubSanitizer(calls?: string[]): ReturnType<typeof vi.fn<SanitizeHtml>> {
  const sanitize: SanitizeHtml = (html) => {
    calls?.push(html)
    return html
      .replace(/<(script|iframe)\b[\s\S]*?<\/\1\s*>/gi, '') // paired blocks removed wholesale
      .replace(/<(script|iframe)\b[^>]*>/gi, '') // stray open tags
      .replace(/<\/(script|iframe)\s*>/gi, '') // stray close tags
      .replace(/\bon[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/((?:href|src)\s*=\s*)(["']?)javascript:[^"'\s>]*\2/gi, '$1""')
  }
  return vi.fn(sanitize)
}

const identitySanitizer: SanitizeHtml = (html) => html

describe('input size helpers', () => {
  it('measures UTF-8 byte length', () => {
    expect(utf8ByteLength('')).toBe(0)
    expect(utf8ByteLength('abc')).toBe(3)
    expect(utf8ByteLength('\u4e00')).toBe(3) // CJK char = 3 bytes
  })

  it('enforces the 1 MiB paste limit', () => {
    expect(PASTE_MAX_BYTES).toBe(1024 * 1024)
    expect(isPasteWithinLimit('# hi')).toBe(true)
    expect(isPasteWithinLimit('a'.repeat(PASTE_MAX_BYTES))).toBe(true)
    expect(isPasteWithinLimit('a'.repeat(PASTE_MAX_BYTES + 1))).toBe(false)
    expect(isPasteWithinLimit('\u4e00'.repeat(PASTE_MAX_BYTES))).toBe(false) // 3 bytes/char
  })
})

describe('md → html (marked, GFM)', () => {
  it('renders headings and emphasis', async () => {
    const outcome = await mdToHtml('# Title\n\nplain **bold** *em* tail', identitySanitizer)
    expectOk(outcome)
    expect(outcome.value).toContain('<h1>Title</h1>')
    expect(outcome.value).toContain('<strong>bold</strong>')
    expect(outcome.value).toContain('<em>em</em>')
  })

  it('renders GFM tables', async () => {
    const outcome = await mdToHtml('| a | b |\n| --- | --- |\n| 1 | 2 |', identitySanitizer)
    expectOk(outcome)
    expect(outcome.value).toContain('<table>')
    expect(outcome.value).toContain('<th>a</th>')
    expect(outcome.value).toContain('<th>b</th>')
    expect(outcome.value).toContain('<td>1</td>')
    expect(outcome.value).toContain('<td>2</td>')
  })

  it('renders task list checkboxes', async () => {
    const outcome = await mdToHtml('- [x] done\n- [ ] todo', identitySanitizer)
    expectOk(outcome)
    expect(outcome.value.match(/<input[^>]*type="checkbox">/g)).toHaveLength(2)
    expect(outcome.value).toMatch(/<input[^>]*checked[^>]*type="checkbox">/)
    expect(outcome.value).toMatch(/<input(?![^>]*checked)[^>]*type="checkbox">/)
  })

  it('renders strikethrough', async () => {
    const outcome = await mdToHtml('~~gone~~ text', identitySanitizer)
    expectOk(outcome)
    expect(outcome.value).toContain('<del>gone</del>')
  })

  it('autolinks bare URLs', async () => {
    const outcome = await mdToHtml('see https://example.co/x now', identitySanitizer)
    expectOk(outcome)
    expect(outcome.value).toContain('<a href="https://example.co/x">https://example.co/x</a>')
  })

  it('emits bare <pre><code> for fenced code: no language class, no highlight markup', async () => {
    const outcome = await mdToHtml('```js\nconst x = 1;\n```', identitySanitizer)
    expectOk(outcome)
    expect(outcome.value).toContain('<pre><code>')
    expect(outcome.value).toContain('const x = 1;')
    expect(outcome.value).not.toContain('class=')
    expect(outcome.value).not.toContain('language-')
    expect(outcome.value).not.toMatch(/highlight/i)
  })

  it('does not interpret footnote syntax', async () => {
    const outcome = await mdToHtml('ref[^1]\n\n[^1]: the note', identitySanitizer)
    expectOk(outcome)
    expect(outcome.value).toContain('[^1]')
    expect(outcome.value).not.toContain('<sup')
    expect(outcome.value).not.toContain('footnote')
  })

  it('passes data: URI images through the render pipeline', async () => {
    const outcome = await mdToHtml('![d](data:image/png;base64,iVBORw0KGgo=)', identitySanitizer)
    expectOk(outcome)
    expect(outcome.value).toContain('src="data:image/png;base64,iVBORw0KGgo="')
  })

  it('rejects empty input', async () => {
    expect(errorCodesOf(await mdToHtml('', identitySanitizer))).toEqual(['empty'])
    expect(errorCodesOf(await mdToHtml('   \n  ', identitySanitizer))).toEqual(['empty'])
  })
})

describe('html → md (turndown + gfm, structure fidelity)', () => {
  it('restores headings, lists, links, images and emphasis', async () => {
    const outcome = await htmlToMarkdown(
      '<h2>Head</h2><ul><li>a</li><li>b</li></ul><ol><li>one</li></ol>' +
        '<p><a href="https://x.co">t</a> <img src="i.png" alt="p"> <b>bold</b></p>',
      identitySanitizer,
    )
    expectOk(outcome)
    expect(outcome.value).toContain('## Head')
    expect(outcome.value).toContain('-   a')
    expect(outcome.value).toContain('-   b')
    expect(outcome.value).toContain('1.  one')
    expect(outcome.value).toContain('[t](https://x.co)')
    expect(outcome.value).toContain('![p](i.png)')
    expect(outcome.value).toContain('**bold**')
  })

  it('restores GFM tables', async () => {
    const outcome = await htmlToMarkdown(
      '<table><thead><tr><th>a</th><th>b</th></tr></thead>' +
        '<tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
      identitySanitizer,
    )
    expectOk(outcome)
    expect(outcome.value).toContain('| a | b |')
    expect(outcome.value).toContain('| 1 | 2 |')
  })

  it('restores nested lists', async () => {
    const outcome = await htmlToMarkdown(
      '<ul><li>a<ul><li>a1</li></ul></li><li>b</li></ul>',
      identitySanitizer,
    )
    expectOk(outcome)
    expect(outcome.value).toContain('-   a')
    expect(outcome.value).toContain('    -   a1')
    expect(outcome.value).toContain('-   b')
  })

  it('drops style/layout info but keeps content (div wrapper, class, style)', async () => {
    const outcome = await htmlToMarkdown(
      '<div class="wrap" style="color:red"><p>kept text</p></div>',
      identitySanitizer,
    )
    expectOk(outcome)
    expect(outcome.value).toContain('kept text')
    expect(outcome.value).not.toContain('class')
    expect(outcome.value).not.toContain('style')
    expect(outcome.value).not.toContain('<div')
  })

  it('preserves blockquotes and fenced code', async () => {
    const outcome = await htmlToMarkdown(
      '<blockquote><p>quote</p></blockquote><pre><code class="language-js">const x = 1;</code></pre>',
      identitySanitizer,
    )
    expectOk(outcome)
    expect(outcome.value).toContain('> quote')
    expect(outcome.value).toContain('```js')
    expect(outcome.value).toContain('const x = 1;')
  })

  it('rejects empty input', async () => {
    expect(errorCodesOf(await htmlToMarkdown('', identitySanitizer))).toEqual(['empty'])
  })
})

describe('md → html → md round trip (structure fidelity)', () => {
  /** Whitespace- and marker-insensitive comparison of markdown structure. */
  function normalizeStructure(md: string): string {
    return md
      .split('\n')
      .map((line) => line.trim().replace(/\s+/g, ' '))
      .filter((line) => line.length > 0)
      .map((line) => line.replace(/^\* /, '- ').replace(/~{1,2}([^~]+)~{1,2}/g, '~~$1~~'))
      .join('\n')
  }

  it('is structurally equivalent after whitespace normalization', async () => {
    const original = [
      '## Heading',
      '',
      'Plain **bold** and *em* tail.',
      '',
      '> quoted line',
      '',
      '- [x] done',
      '- [ ] todo',
      '',
      '- top',
      '  - nested',
      '- bottom',
      '',
      '1. first',
      '2. second',
      '',
      '[link](https://example.co/page) and ![img](pic.png)',
      '',
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '~~gone~~',
    ].join('\n')

    const html = await mdToHtml(original, identitySanitizer)
    expectOk(html)
    const back = await htmlToMarkdown(html.value, identitySanitizer)
    expectOk(back)

    expect(normalizeStructure(back.value)).toBe(normalizeStructure(original))
  })
})

describe('sanitize seam (structural, node-safe)', () => {
  it('md→html: raw marked output goes through exactly one sanitize step', async () => {
    const calls: string[] = []
    const spy = makeStubSanitizer(calls)
    const outcome = await mdToHtml('# T\n\n<script>alert(1)</script>', spy)
    expectOk(outcome)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(calls[0]).toContain('<h1>') // raw pipeline output, pre-sanitize
    expect(calls[0]).toContain('<script>') // sanitizer sees the raw material
    expect(outcome.value).not.toContain('<script')
    expect(outcome.value).not.toContain('alert(')
  })

  it('html→md: input HTML is sanitized before conversion (same step, one call)', async () => {
    const calls: string[] = []
    const spy = makeStubSanitizer(calls)
    const input = '<p>hi</p><script>alert(1)</script><b>bold</b>'
    const outcome = await htmlToMarkdown(input, spy)
    expectOk(outcome)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(calls[0]).toBe(input) // the raw input is the sanitize material
    expect(outcome.value).toContain('hi')
    expect(outcome.value).toContain('**bold**')
    expect(outcome.value.toLowerCase()).not.toContain('script')
    expect(outcome.value).not.toContain('alert(')
  })

  it('convert() dispatches per direction through the same sanitize step', async () => {
    const spy = makeStubSanitizer()
    const mdOutcome = await convert('# T', 'md-to-html', spy)
    expectOk(mdOutcome)
    expect(mdOutcome.value).toContain('<h1>')
    const htmlOutcome = await convert('<p>hi</p>', 'html-to-md', spy)
    expectOk(htmlOutcome)
    expect(htmlOutcome.value).toContain('hi')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('strips XSS fixtures on both directions (stub mirrors DOMPurify decisions)', async () => {
    const payloads = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<p><a href="javascript:alert(1)">c</a></p>',
      '<iframe src="https://evil.example"></iframe>',
    ]
    for (const payload of payloads) {
      const asHtml = await mdToHtml(payload, makeStubSanitizer())
      expectOk(asHtml)
      expect(asHtml.value).not.toMatch(/<script/i)
      expect(asHtml.value).not.toMatch(/<iframe/i)
      expect(asHtml.value).not.toContain('onerror')
      expect(asHtml.value).not.toContain('javascript:')

      const asMd = await htmlToMarkdown(payload, makeStubSanitizer())
      expectOk(asMd)
      expect(asMd.value).not.toMatch(/<script/i)
      expect(asMd.value).not.toMatch(/<iframe/i)
      expect(asMd.value).not.toContain('onerror')
      expect(asMd.value).not.toContain('javascript:')
      expect(asMd.value).not.toContain('alert(1)')
    }
  })
})

describe('convert() guards', () => {
  it('rejects empty input', async () => {
    expect(errorCodesOf(await convert('', 'md-to-html', identitySanitizer))).toEqual(['empty'])
    expect(errorCodesOf(await convert(' \n ', 'html-to-md', identitySanitizer))).toEqual(['empty'])
  })

  it('rejects paste input over 1 MiB', async () => {
    const tooLarge = 'a'.repeat(PASTE_MAX_BYTES + 1)
    expect(errorCodesOf(await convert(tooLarge, 'md-to-html', identitySanitizer))).toEqual([
      'pasteTooLarge',
    ])
    expect(errorCodesOf(await convert(tooLarge, 'html-to-md', identitySanitizer))).toEqual([
      'pasteTooLarge',
    ])
  })

  it('accepts input at exactly the limit', async () => {
    const atLimit = '#'.repeat(PASTE_MAX_BYTES)
    const outcome = await convert(atLimit, 'md-to-html', identitySanitizer)
    expectOk(outcome)
  })
})

describe('sanitizer loading', () => {
  it('degrades to identity in a DOM-less runtime and caches the instance', async () => {
    const sanitize = await loadSanitizer()
    // Node (vitest env): dompurify loads but is unsupported without a DOM,
    // so the single sanitize step degrades to identity. Real sanitization
    // runs in the browser (same loadSanitizer, same DOMPurify default config).
    expect(sanitize('<b>x</b>')).toBe('<b>x</b>')
    expect(await loadSanitizer()).toBe(sanitize)
  })
})
