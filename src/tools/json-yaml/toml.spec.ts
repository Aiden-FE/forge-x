/**
 * 10 票扩展：TOML 第三格式验收。
 *
 * - round-trip fixture：嵌套表 / 数组 / inline table / datetime / 大整数；
 * - `1.0` 不降级（numbersAsFloat）与 `007` 前导零拒绝（行列定位）；
 * - `__proto__` 键样例：unsafeKeyBehaviour 'keep' + 降级不 Object.assign；
 * - 大整数/datetime 降级字符串化以 notices 显式声明（不静默）；
 * - smol-toml 体积闸（发布闸）：真实打包口径 min+gzip。
 */
import { describe, expect, it } from 'vitest'
import { convertFormat } from './jsonYaml'
import type { ConversionNotice } from './jsonYaml'

/** 验收 fixture：嵌套表 / 数组 / inline table / datetime / 大整数 / 浮点。 */
const FIXTURE = [
  '# comments are not preserved',
  'title = "forge-x"',
  'float = 1.0',
  'big = 9223372036854775807',
  'created = 1979-05-27T07:32:00Z',
  'local_date = 1979-05-27',
  '',
  '[server]',
  'ports = [8080, 8081]',
  'enabled = true',
  'point = { x = 1, y = 2 }',
  '',
  '[[items]]',
  'name = "a"',
  '',
  '[[items]]',
  'name = "b"',
].join('\n')

function noticesOf(outcome: { ok: true; notices: ConversionNotice[] }): Map<string, number> {
  return new Map(outcome.notices.map((notice) => [notice.code, notice.count]))
}

async function parseTomlValue(text: string): Promise<unknown> {
  const toml = await import('smol-toml')
  return toml.parse(text, { integersAsBigInt: 'asNeeded', unsafeKeyBehaviour: 'keep' })
}

describe('TOML → JSON / YAML（值保真 + 降级声明）', () => {
  it('嵌套表 / 数组 / inline table / 标量保真；datetime 与大整数降级字符串并声明', async () => {
    const outcome = await convertFormat(FIXTURE, 'toml', 'json')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const value = JSON.parse(outcome.value) as Record<string, unknown>
    expect(value.title).toBe('forge-x')
    expect(value.float).toBe(1)
    expect(value.server).toEqual({
      ports: [8080, 8081],
      enabled: true,
      point: { x: 1, y: 2 },
    })
    expect(value.items).toEqual([{ name: 'a' }, { name: 'b' }])
    // 大整数字符串化（> 2^53−1），datetime 降级为 ISO 字面字符串。
    expect(value.big).toBe('9223372036854775807')
    expect(value.created).toBe('1979-05-27T07:32:00.000Z')
    expect(value.local_date).toBe('1979-05-27')

    const notices = noticesOf(outcome)
    expect(notices.get('bigint-stringified')).toBe(1)
    expect(notices.get('datetime-stringified')).toBe(2)
  })

  it('TOML → YAML：同样降级并声明（js-yaml 不接受 BigInt）', async () => {
    const outcome = await convertFormat(FIXTURE, 'toml', 'yaml')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.value).toContain("big: '9223372036854775807'")
    expect(outcome.value).toContain("created: '1979-05-27T07:32:00.000Z'")
    expect(noticesOf(outcome).get('bigint-stringified')).toBe(1)
    expect(noticesOf(outcome).get('datetime-stringified')).toBe(2)
  })
})

describe('→ TOML（numbersAsFloat：1.0 不降级）', () => {
  it('JSON → TOML：1.0 保持浮点字面，不降级为 1', async () => {
    const outcome = await convertFormat('{"float":1.0}', 'json', 'toml')
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.value).toContain('float = 1.0')
      expect(outcome.value).not.toMatch(/float = 1\r?\n/)
    }
  })

  it('YAML → TOML：基础双向（标量 / 列表 / 嵌套）', async () => {
    const outcome = await convertFormat('enabled: true\ntags:\n  - dev\n  - local\n', 'yaml', 'toml')
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      const parsed = await parseTomlValue(outcome.value)
      expect(parsed).toEqual({ enabled: true, tags: ['dev', 'local'] })
    }
  })

  it('TOML → TOML（同格式规范化）：1.0 / 大整数 / datetime 原样保留且零声明', async () => {
    const outcome = await convertFormat(FIXTURE, 'toml', 'toml')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.value).toContain('float = 1.0')
    // BigInt 原生可序列化：仍是裸整数，不字符串化、不声明。
    expect(outcome.value).toContain('big = 9223372036854775807')
    expect(outcome.value).not.toContain('big = "9223372036854775807"')
    // TomlDate 原生序列化（legacy 精度：补齐毫秒）。
    expect(outcome.value).toContain('created = 1979-05-27T07:32:00.000Z')
    expect(outcome.value).toContain('local_date = 1979-05-27')
    expect(outcome.notices).toEqual([])
  })
})

describe('round-trip fixture（TOML → JSON → TOML）', () => {
  it('结构值往返保真；声明型降级（大整数 / datetime）按口径不复活', async () => {
    const toJson = await convertFormat(FIXTURE, 'toml', 'json')
    expect(toJson.ok).toBe(true)
    if (!toJson.ok) return

    const backToToml = await convertFormat(toJson.value, 'json', 'toml')
    expect(backToToml.ok).toBe(true)
    if (!backToToml.ok) return

    const revived = (await parseTomlValue(backToToml.value)) as Record<string, unknown>
    // 结构保真：嵌套表 / 数组 / inline table（inline table 以表头形态重现，值等价）。
    expect(revived.title).toBe('forge-x')
    expect(revived.server).toEqual({
      ports: [8080, 8081],
      enabled: true,
      point: { x: 1, y: 2 },
    })
    expect(revived.items).toEqual([{ name: 'a' }, { name: 'b' }])
    expect(revived.float).toBe(1)
    // 逆向不复活（票据锁定）：字符串化的 datetime / 大整数以字符串落地。
    expect(revived.big).toBe('9223372036854775807')
    expect(revived.created).toBe('1979-05-27T07:32:00.000Z')
  })
})

describe('__proto__ 键样例（unsafeKeyBehaviour keep + 不 Object.assign）', () => {
  it('TOML → JSON：__proto__ 作为自身键保留，不污染原型', async () => {
    const outcome = await convertFormat('__proto__ = 1\nok = 2', 'toml', 'json')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const parsed = JSON.parse(outcome.value) as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(true)
    expect(parsed.__proto__).toBe(1)
    expect(parsed.ok).toBe(2)
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype)
  })

  it('JSON → TOML：__proto__ 自身键输出为 TOML 键', async () => {
    const outcome = await convertFormat('{"__proto__": 1, "ok": 2}', 'json', 'toml')
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.value).toContain('__proto__ = 1')
      expect(outcome.value).toContain('ok = 2')
    }
  })
})

describe('007 前导零与错误定位', () => {
  it('TOML 前导零整数按规范拒绝，带行列定位', async () => {
    const outcome = await convertFormat('a = 007', 'toml', 'json')
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.error.source).toBe('toml')
    expect(outcome.error.line).toBe(1)
    expect(outcome.error.column).toBe(5)
  })

  it('未闭合表头等词法错误同样带定位', async () => {
    const outcome = await convertFormat('[server\na = 1', 'toml', 'yaml')
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.error.source).toBe('toml')
    expect(outcome.error.line).toBeDefined()
    expect(outcome.error.column).toBeDefined()
  })

  it('空输入：ok:false，不作为异常抛出（UI 走占位分支）', async () => {
    for (const format of ['json', 'yaml', 'toml'] as const) {
      const outcome = await convertFormat('   ', format, 'json')
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.error.message).toBe('empty input')
    }
  })

  it('JSON/YAML 源的既有行列定位在统一入口下不变', async () => {
    const json = await convertFormat('{\n  "a":1\n  "b":2\n}', 'json', 'toml')
    expect(json.ok).toBe(false)
    if (!json.ok) {
      expect(json.error.source).toBe('json')
      expect(json.error.line).toBe(3)
      expect(json.error.column).toBe(3)
    }

    const yaml = await convertFormat('a: [1,', 'yaml', 'toml')
    expect(yaml.ok).toBe(false)
    if (!yaml.ok) {
      expect(yaml.error.source).toBe('yaml')
      expect(yaml.error.line).toBe(1)
      expect(yaml.error.column).toBe(7)
    }
  })
})

describe('smol-toml 体积闸（发布闸）', () => {
  it(
    '异步块真实负载 min+gzip ≤ 8 KB（票据 1.5 KB 口径勘误：999 B 实测自 dist/index.js re-export 壳）',
    { timeout: 120_000 },
    async () => {
      const { createRequire } = await import('node:module')
      const { pathToFileURL } = await import('node:url')
      const { gzipSync } = await import('node:zlib')
      const nodeRequire = createRequire(import.meta.url)

      // rolldown 随 vite 安装（pnpm 隔离），从 vite 位置解析；smol-toml 为根依赖。
      const rolldownPath = nodeRequire.resolve('rolldown', {
        paths: [nodeRequire.resolve('vite')],
      })
      const rolldown = (await import(pathToFileURL(rolldownPath).href)) as {
        build: (options: Record<string, unknown>) => Promise<{
          output: Array<{ code?: string }>
        }>
      }

      const built = await rolldown.build({
        input: nodeRequire.resolve('smol-toml'),
        write: false,
        logLevel: 'silent',
        output: { format: 'esm', minify: true },
      })
      const code = built.output.map((chunk) => chunk.code ?? '').join('')
      expect(code).toContain('parse')
      const gzipped = gzipSync(Buffer.from(code), { level: 9 }).length
      // 实测 ≈ 5.9–6.6 KB gz（minified ESM，gzip -9）。首屏第三方增量仍为 0
      // （首用 dynamic import）；闸值给出发布余量并防依赖体积回退。
      expect(gzipped).toBeLessThanOrEqual(8 * 1024)
    },
  )
})
