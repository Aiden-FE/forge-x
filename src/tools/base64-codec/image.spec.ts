import { describe, expect, it } from 'vitest'
import {
  IMAGE_MAX_BATCH_FILES,
  IMAGE_MAX_FILE_BYTES,
  buildImageFragments,
  bytesToBase64,
  dedupeFileName,
  encodeImageFile,
  imageMimeExtension,
  parseImageDataUri,
  selectImageBatch,
  sniffImageMime,
} from './image'

/** 1×1 红点 PNG（独立真值：其 base64 为公开已知的最小 PNG）。 */
const PNG_BYTES = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

function makeFile(overrides: Partial<{ name: string; type: string; bytes: Uint8Array }> = {}): {
  name: string
  type: string
  bytes: Uint8Array
} {
  return { name: 'pixel.png', type: 'image/png', bytes: PNG_BYTES, ...overrides }
}

describe('sniffImageMime（魔数嗅探）', () => {
  it('识别 png / jpeg / gif / webp / bmp / ico', () => {
    expect(sniffImageMime(PNG_BYTES)).toBe('image/png')
    expect(sniffImageMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffImageMime(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe('image/gif')
    expect(sniffImageMime(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]))).toBe('image/gif')
    expect(sniffImageMime(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp')
    expect(sniffImageMime(Uint8Array.from([0x42, 0x4d, 0x00]))).toBe('image/bmp')
    expect(sniffImageMime(Uint8Array.from([0x00, 0x00, 0x01, 0x00]))).toBe('image/x-icon')
  })

  it('非图片字节返回 null', () => {
    expect(sniffImageMime(Uint8Array.from([0x3c, 0x68, 0x74, 0x6d, 0x6c]))).toBeNull() // <html
    expect(sniffImageMime(new Uint8Array(0))).toBeNull()
  })
})

describe('encodeImageFile（单文件 ≤ 20 MiB，MIME 识别）', () => {
  it('PNG 文件产出三形态，data URI 为 image/png;base64', () => {
    const outcome = encodeImageFile(makeFile())
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.item.mime).toBe('image/png')
    expect(outcome.item.dataUri).toBe(`data:image/png;base64,${outcome.item.base64}`)
    expect(outcome.item.imgFragment).toBe(`<img src="${outcome.item.dataUri}" alt="pixel.png">`)
    expect(outcome.item.cssFragment).toBe(`url("${outcome.item.dataUri}")`)
  })

  it('魔数嗅探优先于声明 MIME（text/png 声明仍按 PNG 输出）', () => {
    const outcome = encodeImageFile(makeFile({ type: 'text/png' }))
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.item.mime).toBe('image/png')
  })

  it('不可嗅探但声明为 image/* 的文件（如 svg）按声明 MIME 接受', () => {
    const svg = Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))
    const outcome = encodeImageFile(makeFile({ name: 'logo.svg', type: 'image/svg+xml', bytes: svg }))
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.item.mime).toBe('image/svg+xml')
  })

  it('恰好 20 MiB 通过，超过 20 MiB 定位报错 tooLarge', () => {
    const atLimit = new Uint8Array(IMAGE_MAX_FILE_BYTES)
    // 写入 JPEG 魔数，避免依赖声明兜底
    atLimit.set([0xff, 0xd8, 0xff, 0xe0], 0)
    expect(encodeImageFile(makeFile({ name: 'big.jpg', type: 'image/jpeg', bytes: atLimit })).ok).toBe(true)

    const overLimit = new Uint8Array(IMAGE_MAX_FILE_BYTES + 1)
    overLimit.set([0xff, 0xd8, 0xff, 0xe0], 0)
    const outcome = encodeImageFile(makeFile({ name: 'big.jpg', type: 'image/jpeg', bytes: overLimit }))
    expect(outcome).toEqual({ ok: false, reason: 'tooLarge' })
  })

  it('既嗅探不出也非 image/* 声明 → notImage', () => {
    const html = Uint8Array.from(Buffer.from('<html></html>'))
    expect(encodeImageFile(makeFile({ name: 'page.html', type: 'text/html', bytes: html }))).toEqual({
      ok: false,
      reason: 'notImage',
    })
  })

  it('文件名含引号时 img 片段的 alt 被转义', () => {
    const outcome = encodeImageFile(makeFile({ name: 'a"b<c>.png' }))
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.item.imgFragment).toContain('alt="a&quot;b&lt;c&gt;.png"')
  })
})

describe('selectImageBatch（批量 ≤ 20 文件）', () => {
  function fileOf(size: number, name: string): { name: string; size: number } {
    return { name, size }
  }

  it('20 个文件全部入批，第 21 个起 tooMany', () => {
    const files = Array.from({ length: 22 }, (_, i) => fileOf(10, `f${i}.png`))
    const selection = selectImageBatch(files)
    expect(selection.accepted).toHaveLength(IMAGE_MAX_BATCH_FILES)
    expect(selection.rejected).toHaveLength(2)
    expect(selection.rejected.map((r) => r.reason)).toEqual(['tooMany', 'tooMany'])
  })

  it('超限文件记 tooLarge 且不占用名额（后面的合法文件仍可入批）', () => {
    const big = IMAGE_MAX_FILE_BYTES + 1
    const files = [
      fileOf(big, 'too-big.png'),
      fileOf(10, 'ok.png'),
      fileOf(big, 'too-big2.png'),
      fileOf(10, 'ok2.png'),
    ]
    const selection = selectImageBatch(files)
    expect(selection.accepted.map((f) => f.name)).toEqual(['ok.png', 'ok2.png'])
    expect(selection.rejected.map((r) => `${r.file.name}:${r.reason}`)).toEqual([
      'too-big.png:tooLarge',
      'too-big2.png:tooLarge',
    ])
  })

  it('恰好 20 MiB 的文件入批', () => {
    const selection = selectImageBatch([fileOf(IMAGE_MAX_FILE_BYTES, 'edge.png')])
    expect(selection.accepted).toHaveLength(1)
    expect(selection.rejected).toHaveLength(0)
  })
})

describe('parseImageDataUri（mime 前缀自动识别）', () => {
  const PNG_BASE64 = bytesToBase64(PNG_BYTES)

  it('标准 data URI 解出图片字节', () => {
    const result = parseImageDataUri(`data:image/png;base64,${PNG_BASE64}`)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.mime).toBe('image/png')
      expect([...result.bytes]).toEqual([...PNG_BYTES])
    }
  })

  it('mime 大小写不敏感（DATA:IMAGE/PNG）', () => {
    const result = parseImageDataUri(`DATA:IMAGE/PNG;BASE64,${PNG_BASE64}`)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.mime).toBe('image/png')
  })

  it('缺失 ;base64 参数容错', () => {
    const result = parseImageDataUri(`data:image/png,${PNG_BASE64}`)
    expect(result.ok).toBe(true)
    if (result.ok) expect([...result.bytes]).toEqual([...PNG_BYTES])
  })

  it('data URI 前后空白可容忍（粘贴常见）', () => {
    const result = parseImageDataUri(`  \ndata:image/gif;base64,${PNG_BASE64}\n `)
    expect(result.ok).toBe(true)
  })

  it('非图片 data URI（text/html）报错 not-image', () => {
    const payload = bytesToBase64(Uint8Array.from(Buffer.from('<h1>hi</h1>')))
    expect(parseImageDataUri(`data:text/html;base64,${payload}`)).toEqual({ ok: false, reason: 'not-image' })
  })

  it('畸形 data URI（无逗号）报错 format；坏 base64 报错 base64', () => {
    expect(parseImageDataUri('data:image/png;base64')).toEqual({ ok: false, reason: 'format' })
    expect(parseImageDataUri('data:image/png;base64,!!!!')).toEqual({ ok: false, reason: 'base64' })
  })

  it('裸 base64 按魔数嗅探 mime', () => {
    const result = parseImageDataUri(PNG_BASE64)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.mime).toBe('image/png')
  })

  it('裸 base64 嗅探不出图片 → not-image；空输入 → empty', () => {
    const html = bytesToBase64(Uint8Array.from(Buffer.from('<html></html>')))
    expect(parseImageDataUri(html)).toEqual({ ok: false, reason: 'not-image' })
    expect(parseImageDataUri('   ')).toEqual({ ok: false, reason: 'empty' })
  })

  it('往返：encode → decode → 字节一致', () => {
    const encoded = encodeImageFile(makeFile({ name: 'roundtrip.png' }))
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return
    const decoded = parseImageDataUri(encoded.item.dataUri)
    expect(decoded.ok).toBe(true)
    if (decoded.ok) {
      expect(decoded.mime).toBe(encoded.item.mime)
      expect([...decoded.bytes]).toEqual([...PNG_BYTES])
    }
  })

  it('base64 输出为标准字母表且含 padding（data URI 形态），可被 atob 还原', () => {
    const encoded = encodeImageFile(makeFile())
    expect(encoded.ok).toBe(true)
    if (encoded.ok) {
      const binary = atob(encoded.item.base64)
      expect(new Uint8Array(Buffer.from(binary, 'binary'))).toEqual(PNG_BYTES)
    }
  })
})

describe('buildImageFragments / imageMimeExtension', () => {
  it('三形态由同一 data URI 派生', () => {
    const forms = buildImageFragments('x.png', 'image/png', 'QUJD')
    expect(forms.dataUri).toBe('data:image/png;base64,QUJD')
    expect(forms.imgFragment).toBe('<img src="data:image/png;base64,QUJD" alt="x.png">')
    expect(forms.cssFragment).toBe('url("data:image/png;base64,QUJD")')
  })

  it('MIME → 输出扩展名', () => {
    expect(imageMimeExtension('image/png')).toBe('png')
    expect(imageMimeExtension('image/jpeg')).toBe('jpg')
    expect(imageMimeExtension('image/webp')).toBe('webp')
    expect(imageMimeExtension('image/svg+xml')).toBe('svg')
    expect(imageMimeExtension('image/other')).toBe('img')
  })
})

describe('dedupeFileName（冲突追加 _1/_2）', () => {
  it('无冲突原样返回并登记', () => {
    const used = new Set<string>()
    expect(dedupeFileName('image.png', used)).toBe('image.png')
    expect(used.has('image.png')).toBe(true)
  })

  it('冲突追加 _1，再冲突 _2', () => {
    const used = new Set<string>()
    expect(dedupeFileName('image.png', used)).toBe('image.png')
    expect(dedupeFileName('image.png', used)).toBe('image_1.png')
    expect(dedupeFileName('image.png', used)).toBe('image_2.png')
  })

  it('无扩展名的名称同样追加序号；预占 _1 时跳到 _2', () => {
    const used = new Set<string>()
    expect(dedupeFileName('blob', used)).toBe('blob')
    expect(dedupeFileName('blob', used)).toBe('blob_1')
    expect(dedupeFileName('blob', used)).toBe('blob_2')

    const used2 = new Set<string>(['image.png', 'image_1.png'])
    expect(dedupeFileName('image.png', used2)).toBe('image_2.png')
  })
})
