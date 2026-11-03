import { describe, expect, it } from 'vitest'
import {
  BUILDER_FIELDS,
  BUILDER_PRESETS,
  CRON_TEMPLATES,
  buildExpression,
  defaultBuilderField,
  describeCron,
  explainField,
  parseCron,
  previewRuns,
} from './cron'
import type { BuilderFieldState, CronFieldName, Translate } from './cron'
import cronLocale from '@/locales/tools/cron-tool'

/**
 * 从 locale fragment 构造真实翻译函数（校验文案键与插值占位符真实可用）。
 */
function makeTranslator(lang: 'zh-CN' | 'en'): Translate {
  const part = cronLocale[lang] as Record<string, unknown>
  return (key, params) => {
    const parts = key.split('.')
    let node: unknown = part
    for (const p of parts) {
      if (typeof node !== 'object' || node === null) return key
      node = (node as Record<string, unknown>)[p]
    }
    if (typeof node !== 'string') return key
    if (!params) return node
    return node.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name] ?? `{{${name}}}`))
  }
}

const zh = makeTranslator('zh-CN')

/** 固定 currentDate fixture：2026-01-01 为周四。 */
const FIXED_DATE = new Date('2026-01-01T00:00:00Z')

describe('字段制式识别（验收 #1）', () => {
  it('5 字段 `0 9 * * *` 正确识别为标准制式', () => {
    const r = parseCron('0 9 * * *')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.hasSeconds).toBe(false)
    expect(r.fields.minute.items).toEqual([{ kind: 'single', value: 0, raw: '0' }])
    expect(r.fields.hour.items).toEqual([{ kind: 'single', value: 9, raw: '9' }])
    expect(r.fields.dom.items).toEqual([{ kind: 'any' }])
    expect(r.fields.month.items).toEqual([{ kind: 'any' }])
    expect(r.fields.dow.items).toEqual([{ kind: 'any' }])
  })

  it('6 字段（首位秒，Spring 风格）`0 30 9 * * *` 自动识别', () => {
    const r = parseCron('0 30 9 * * *')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.hasSeconds).toBe(true)
    expect(r.fields.second?.items).toEqual([{ kind: 'single', value: 0, raw: '0' }])
    expect(r.fields.minute.items).toEqual([{ kind: 'single', value: 30, raw: '30' }])
    expect(r.fields.hour.items).toEqual([{ kind: 'single', value: 9, raw: '9' }])
  })

  it('7 字段明确报不支持年份字段', () => {
    const r = parseCron('0 9 * * * * 2026')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatchObject({ scope: 'expression', kind: 'yearUnsupported', count: 7 })
    expect(r.partial).toBeUndefined()
  })

  it('字段数不足整串报错', () => {
    const r = parseCron('* * * *')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatchObject({ scope: 'expression', kind: 'fieldCount', count: 4 })
  })

  it('空输入报空', () => {
    const r = parseCron('   ')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatchObject({ scope: 'expression', kind: 'empty' })
  })

  it('月/周名称缩写（jan、mon）受支持并按数值校验范围', () => {
    const r = parseCron('* * * jan mon')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fields.month.items).toEqual([{ kind: 'single', value: 1, raw: 'jan' }])
    expect(r.fields.dow.items).toEqual([{ kind: 'single', value: 1, raw: 'mon' }]) // mon = 周一 = 1
  })
})

describe('周字段口径（验收 #2）', () => {
  it('dow 0 与 7 均为周日：解析通过且预览落在同一天', async () => {
    const r0 = parseCron('* * * * 0')
    const r7 = parseCron('* * * * 7')
    expect(r0.ok).toBe(true)
    expect(r7.ok).toBe(true)
    if (!r0.ok || !r7.ok) return
    expect(r0.fields.dow.items).toEqual([{ kind: 'single', value: 0, raw: '0' }])
    expect(r7.fields.dow.items).toEqual([{ kind: 'single', value: 7, raw: '7' }])

    const p0 = await previewRuns('* * * * 0', { count: 1, currentDate: FIXED_DATE, tz: 'UTC' })
    const p7 = await previewRuns('* * * * 7', { count: 1, currentDate: FIXED_DATE, tz: 'UTC' })
    expect(p0.ok && p7.ok).toBe(true)
    if (!p0.ok || !p7.ok) return
    // 2026-01-01 周四 → 下一个周日 2026-01-04（UTC 输出为 Z 后缀）
    expect(p0.runs[0]).toBe('2026-01-04T00:00:00.000Z')
    expect(p7.runs[0]).toBe(p0.runs[0])
  })

  it('描述与预览一致：dow 7 的中文描述含「星期日」', async () => {
    const desc = await describeCron('* * * * 7', 'zh-CN')
    expect(desc).toContain('星期日')
  })

  it('dow 白话解释对 7 附「7 = 周日」注记', () => {
    const r = parseCron('* * * * 7')
    if (!r.ok) throw new Error('parse failed')
    expect(explainField(r.fields.dow, zh)).toContain('7 = 周日')
  })
})

describe('字段定位（验收 #3）', () => {
  it('`99 * * * *` 分超界：只红分字段，其余字段速览照常（partial）', () => {
    const r = parseCron('99 * * * *')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatchObject({ scope: 'field', field: 'minute', kind: 'range', value: 99, min: 0, max: 59 })
    expect(Object.keys(r.partial ?? {}).sort()).toEqual(['dom', 'dow', 'hour', 'month'])
    expect(r.partial?.hour?.raw).toBe('*')
  })

  it('`* * * * 8` dow 超界：只红周字段', () => {
    const r = parseCron('* * * * 8')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatchObject({ scope: 'field', field: 'dow', kind: 'range', value: 8, min: 0, max: 7 })
    expect(Object.keys(r.partial ?? {}).sort()).toEqual(['dom', 'hour', 'minute', 'month'])
  })

  it('范围起止颠倒与非法步进各自定位', () => {
    const r1 = parseCron('9-5 * * * *')
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.error).toMatchObject({ scope: 'field', field: 'minute', kind: 'reversed', raw: '9-5' })

    const r2 = parseCron('*/0 * * * *')
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.error).toMatchObject({ scope: 'field', field: 'minute', kind: 'step', raw: '*/0' })
  })

  it('字段错误文案定位到字段并说明原因（真实文案渲染）', () => {
    const r = parseCron('99 * * * *')
    if (r.ok || r.error.scope !== 'field' || r.error.kind !== 'range') throw new Error('expected field range error')
    expect(zh('cronTool.errRange', { raw: r.error.raw, min: String(r.error.min), max: String(r.error.max) })).toBe(
      '「99」超出该字段范围（0–59）',
    )
  })
})

describe('执行预览（验收 #4）', () => {
  it('固定 currentDate 下 5 条时间正确（*/15 分钟）', async () => {
    const p = await previewRuns('*/15 * * * *', { count: 5, currentDate: FIXED_DATE, tz: 'UTC' })
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.runs).toEqual([
      '2026-01-01T00:15:00.000Z',
      '2026-01-01T00:30:00.000Z',
      '2026-01-01T00:45:00.000Z',
      '2026-01-01T01:00:00.000Z',
      '2026-01-01T01:15:00.000Z',
    ])
  })

  it('America/New_York 春令时当日 2:30 如实呈现跳变（不存在的时刻取下一个合法时刻）', async () => {
    // 2026-03-08 02:30 本地时刻不存在；02:30 EST = 07:30Z，取 03:30 EDT
    const p = await previewRuns('30 2 * * *', {
      count: 3,
      currentDate: new Date('2026-03-06T12:00:00Z'),
      tz: 'America/New_York',
    })
    expect(p.ok).toBe(true)
    if (!p.ok) return
    // currentDate = 2026-03-06T12:00Z = 03-06 07:00 EST；当日 2:30 已过
    // runs: 03-07 02:30(-05) → 03-08 02:30 不存在，取 03:30(-04) → 03-09 02:30(-04)
    expect(p.runs[0]).toBe('2026-03-07T02:30:00.000-05:00')
    expect(p.runs[1]).toBe('2026-03-08T03:30:00.000-04:00')
    expect(p.runs[2]).toBe('2026-03-09T02:30:00.000-04:00')
  })
})

describe('时区切换（验收 #5）', () => {
  it('同一表达式 UTC 与 Asia/Shanghai 预览差正确换算', async () => {
    const utc = await previewRuns('0 9 * * *', { count: 1, currentDate: FIXED_DATE, tz: 'UTC' })
    const sh = await previewRuns('0 9 * * *', { count: 1, currentDate: FIXED_DATE, tz: 'Asia/Shanghai' })
    expect(utc.ok && sh.ok).toBe(true)
    if (!utc.ok || !sh.ok) return
    expect(utc.runs[0]).toBe('2026-01-01T09:00:00.000Z')
    // 上海本地 9 点 = 01:00Z，比 UTC 预览早 8 小时
    expect(sh.runs[0]).toBe('2026-01-01T09:00:00.000+08:00')
  })

  it('IANA 时区列表含主流城市（Intl.supportedValuesOf，0 依赖）', () => {
    const zones = Intl.supportedValuesOf('timeZone')
    expect(zones).toContain('Asia/Shanghai')
    expect(zones).toContain('America/New_York')
    expect(zones).toContain('Europe/London')
  })
})

describe('构建器（验收 #6：单向产出、与解析区往返一致）', () => {
  function state(field: CronFieldName, patch: Partial<BuilderFieldState>): BuilderFieldState {
    return { ...defaultBuilderField(field), ...patch }
  }

  it('四种模式各自产出正确 token', () => {
    const fields = {} as Record<CronFieldName, BuilderFieldState>
    for (const f of BUILDER_FIELDS) fields[f] = defaultBuilderField(f)
    expect(buildExpression(fields)).toBe('* * * * *')

    fields.minute = state('minute', { mode: 'enum', enumValues: [0, 15, 30, 45] })
    fields.hour = state('hour', { mode: 'range', rangeFrom: 9, rangeTo: 17 })
    fields.dom = state('dom', { mode: 'step', step: 2 })
    fields.month = state('month', { mode: 'enum', enumValues: [3] })
    fields.dow = state('dow', { mode: 'enum', enumValues: [1, 2, 3, 4, 5] })
    expect(buildExpression(fields)).toBe('0,15,30,45 9-17 */2 3 1,2,3,4,5')
  })

  it('枚举去重升序、越界值剔除；步进最小 1；范围越界收敛到字段范围', () => {
    const minute = state('minute', { mode: 'enum', enumValues: [45, 0, 60, 15, 0] })
    const dom = state('dom', { mode: 'range', rangeFrom: 1, rangeTo: 99 })
    const hour = state('hour', { mode: 'step', step: 0 })
    const expr =
      buildExpression({
        minute,
        hour,
        dom,
        month: defaultBuilderField('month'),
        dow: defaultBuilderField('dow'),
      })
    expect(expr).toBe('0,15,45 */1 1-31 * *')

    // 往返：构建器产出必被解析区接受且项类型一致
    const r = parseCron(expr)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fields.minute.items).toEqual([
      { kind: 'single', value: 0, raw: '0' },
      { kind: 'single', value: 15, raw: '15' },
      { kind: 'single', value: 45, raw: '45' },
    ])
    expect(r.fields.dom.items).toEqual([{ kind: 'range', from: 1, to: 31, raw: '1-31' }])
    expect(r.fields.hour.items).toEqual([{ kind: 'any', step: 1 }])
  })

  it('每种模式 × 每个字段：产出表达式解析往返一致', () => {
    for (const f of BUILDER_FIELDS) {
      const modes: BuilderFieldState[] = [
        state(f, { mode: 'any' }),
        state(f, { mode: 'enum', enumValues: [defaultBuilderField(f).rangeFrom + 1] }),
        state(f, { mode: 'range', rangeFrom: defaultBuilderField(f).rangeFrom, rangeTo: defaultBuilderField(f).rangeFrom + 2 }),
        state(f, { mode: 'step', step: 2 }),
      ]
      for (const st of modes) {
        const fields = {} as Record<CronFieldName, BuilderFieldState>
        for (const g of BUILDER_FIELDS) fields[g] = g === f ? st : defaultBuilderField(g)
        const expr = buildExpression(fields)
        const r = parseCron(expr)
        expect(r.ok, `${f} mode=${st.mode} expr=${expr}`).toBe(true)
        if (!r.ok) continue
        const parsed = r.fields[f]
        if (st.mode === 'enum') {
          expect(parsed.items.every((i) => i.kind === 'single'), `${f} ${expr}`).toBe(true)
        } else if (st.mode === 'range') {
          expect(parsed.items).toEqual([{ kind: 'range', from: st.rangeFrom, to: st.rangeFrom + 2, raw: `${st.rangeFrom}-${st.rangeFrom + 2}` }])
        } else if (st.mode === 'step') {
          expect(parsed.items).toEqual([{ kind: 'any', step: 2 }])
        }
      }
    }
  })

  it('4 个常用预设一键设置构建器', () => {
    expect(BUILDER_PRESETS.map((p) => p.id)).toEqual(['daily9am', 'hourly', 'monday', 'monthlyFirst'])
    for (const preset of BUILDER_PRESETS) {
      const fields = {} as Record<CronFieldName, BuilderFieldState>
      for (const f of BUILDER_FIELDS) fields[f] = { ...defaultBuilderField(f), ...(preset.fields[f] ?? {}) }
      const r = parseCron(buildExpression(fields))
      expect(r.ok, preset.id).toBe(true)
    }
    const daily = {} as Record<CronFieldName, BuilderFieldState>
    for (const f of BUILDER_FIELDS) daily[f] = { ...defaultBuilderField(f), ...(BUILDER_PRESETS[0]!.fields[f] ?? {}) }
    expect(buildExpression(daily)).toBe('0 9 * * *')
  })

  it('11 条模板一键填入结果逐一正确（5 字段、可解析）', () => {
    expect(CRON_TEMPLATES.map((t) => t.expr)).toEqual([
      '* * * * *',
      '0 * * * *',
      '*/15 * * * *',
      '0 0 * * *',
      '0 9 * * *',
      '0 9 * * 1-5',
      '0 9 * * 1',
      '0 10 * * 6,0',
      '0 0 1 * *',
      '0 10 15 * *',
      '0 */6 * * *',
    ])
    for (const tmpl of CRON_TEMPLATES) {
      const r = parseCron(tmpl.expr)
      expect(r.ok, tmpl.id).toBe(true)
      if (r.ok) expect(r.hasSeconds).toBe(false)
    }
  })
})

describe('自然语言描述（验收 #7：语言随应用切换、locale 按需加载）', () => {
  it('en 与 zh-CN 描述各自产出对应语言', async () => {
    const en = await describeCron('*/15 * * * *', 'en')
    const zhDesc = await describeCron('*/15 * * * *', 'zh-CN')
    expect(en).toContain('15 minutes')
    expect(zhDesc).toContain('15 分钟')
    expect(en).not.toBe(zhDesc)
  })

  it('6 字段（带秒）描述正确', async () => {
    const desc = await describeCron('0 30 9 * * *', 'zh-CN')
    expect(desc).toContain('09:30')
  })

  it('双语 fragment 完整：zh-CN 与 en 键集合一致', () => {
    const zhPart = cronLocale['zh-CN'] as Record<string, unknown>
    const enPart = cronLocale.en as Record<string, unknown>
    expect(Object.keys(zhPart).sort()).toEqual(Object.keys(enPart).sort())
    expect(Object.keys(zhPart.tools ?? {}).sort()).toEqual(Object.keys(enPart.tools ?? {}).sort())
    expect(Object.keys(zhPart.cronTool ?? {}).sort()).toEqual(Object.keys(enPart.cronTool ?? {}).sort())
    expect(Object.keys((zhPart.cronTool as Record<string, unknown>).explain ?? {}).sort()).toEqual(
      Object.keys((enPart.cronTool as Record<string, unknown>).explain ?? {}).sort(),
    )
  })
})
