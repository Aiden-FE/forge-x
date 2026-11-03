import { describe, expect, it } from 'vitest'
import {
  DIALECTS,
  DEFAULT_OPTIONS,
  clampExpressionWidth,
  clampLinesBetween,
  formatSql,
} from './sqlEngine'

/** 金样输入：覆盖 SELECT/UPDATE 多语句、字符串、比较符、聚合、LIMIT。 */
const GOLDEN_INPUT =
  "SELECT user_id, name FROM users WHERE status = 'active' AND created_at > '2026-01-01' GROUP BY user_id, name HAVING COUNT(*) > 1 ORDER BY created_at DESC LIMIT 10; UPDATE users SET status = 'inactive' WHERE last_login IS NULL;"

/**
 * 15 方言金样快照（同一输入、默认选项 + UPPER，确定性输出）。
 * 方言间存在真实差异：plsql 把 NAME 大写化、transactsql 与 spark 的
 * LIMIT/UPDATE 折行不同——断言「输出随方言变化」据此成立。
 */
const GOLDEN: Record<string, string> = {
  sql: "SELECT\n  user_id,\n  name\nFROM\n  users\nWHERE\n  status = 'active'\n  AND created_at > '2026-01-01'\nGROUP BY\n  user_id,\n  name\nHAVING\n  COUNT(*) > 1\nORDER BY\n  created_at DESC\nLIMIT\n  10;\n\nUPDATE users\nSET\n  status = 'inactive'\nWHERE\n  last_login IS NULL;",
  mysql: "SELECT\n  user_id,\n  name\nFROM\n  users\nWHERE\n  status = 'active'\n  AND created_at > '2026-01-01'\nGROUP BY\n  user_id,\n  name\nHAVING\n  COUNT(*) > 1\nORDER BY\n  created_at DESC\nLIMIT\n  10;\n\nUPDATE users\nSET\n  status = 'inactive'\nWHERE\n  last_login IS NULL;",
  mariadb: "SELECT\n  user_id,\n  name\nFROM\n  users\nWHERE\n  status = 'active'\n  AND created_at > '2026-01-01'\nGROUP BY\n  user_id,\n  name\nHAVING\n  COUNT(*) > 1\nORDER BY\n  created_at DESC\nLIMIT\n  10;\n\nUPDATE users\nSET\n  status = 'inactive'\nWHERE\n  last_login IS NULL;",
  tidb: "SELECT\n  user_id,\n  name\nFROM\n  users\nWHERE\n  status = 'active'\n  AND created_at > '2026-01-01'\nGROUP BY\n  user_id,\n  name\nHAVING\n  COUNT(*) > 1\nORDER BY\n  created_at DESC\nLIMIT\n  10;\n\nUPDATE users\nSET\n  status = 'inactive'\nWHERE\n  last_login IS NULL;",
  postgresql: "SELECT\n  user_id,\n  name\nFROM\n  users\nWHERE\n  status = 'active'\n  AND created_at > '2026-01-01'\nGROUP BY\n  user_id,\n  name\nHAVING\n  COUNT(*) > 1\nORDER BY\n  created_at DESC\nLIMIT\n  10;\n\nUPDATE users\nSET\n  status = 'inactive'\nWHERE\n  last_login IS NULL;",
  plsql: "SELECT\n  user_id,\n  NAME\nFROM\n  users\nWHERE\n  status = 'active'\n  AND created_at > '2026-01-01'\nGROUP BY\n  user_id,\n  NAME\nHAVING\n  COUNT(*) > 1\nORDER BY\n  created_at DESC LIMIT 10;\n\nUPDATE users\nSET\n  status = 'inactive'\nWHERE\n  last_login IS NULL;",
  sqlite: "SELECT\n  user_id,\n  name\nFROM\n  users\nWHERE\n  status = 'active'\n  AND created_at > '2026-01-01'\nGROUP BY\n  user_id,\n  name\nHAVING\n  COUNT(*) > 1\nORDER BY\n  created_at DESC\nLIMIT\n  10;\n\nUPDATE users\nSET\n  status = 'inactive'\nWHERE\n  last_login IS NULL;",
  transactsql: "SELECT\n  user_id,\n  name\nFROM\n  users\nWHERE\n  status = 'active'\n  AND created_at > '2026-01-01'\nGROUP BY\n  user_id,\n  name\nHAVING\n  COUNT(*) > 1\nORDER BY\n  created_at DESC LIMIT 10;\n\nUPDATE users\nSET\n  status = 'inactive'\nWHERE\n  last_login IS NULL;",
  bigquery: "SELECT\n  user_id,\n  name\nFROM\n  users\nWHERE\n  status = 'active'\n  AND created_at > '2026-01-01'\nGROUP BY\n  user_id,\n  name\nHAVING\n  COUNT(*) > 1\nORDER BY\n  created_at DESC\nLIMIT\n  10;\n\nUPDATE users\nSET\n  status = 'inactive'\nWHERE\n  last_login IS NULL;",
  hive: "SELECT\n  user_id,\n  name\nFROM\n  users\nWHERE\n  status = 'active'\n  AND created_at > '2026-01-01'\nGROUP BY\n  user_id,\n  name\nHAVING\n  COUNT(*) > 1\nORDER BY\n  created_at DESC\nLIMIT\n  10;\n\nUPDATE users\nSET\n  status = 'inactive'\nWHERE\n  last_login IS NULL;",
  spark: "SELECT\n  user_id,\n  name\nFROM\n  users\nWHERE\n  status = 'active'\n  AND created_at > '2026-01-01'\nGROUP BY\n  user_id,\n  name\nHAVING\n  COUNT(*) > 1\nORDER BY\n  created_at DESC\nLIMIT\n  10;\n\nUPDATE users SET status = 'inactive'\nWHERE\n  last_login IS NULL;",
  trino: "SELECT\n  user_id,\n  name\nFROM\n  users\nWHERE\n  status = 'active'\n  AND created_at > '2026-01-01'\nGROUP BY\n  user_id,\n  name\nHAVING\n  COUNT(*) > 1\nORDER BY\n  created_at DESC\nLIMIT\n  10;\n\nUPDATE users\nSET\n  status = 'inactive'\nWHERE\n  last_login IS NULL;",
  redshift: "SELECT\n  user_id,\n  name\nFROM\n  users\nWHERE\n  status = 'active'\n  AND created_at > '2026-01-01'\nGROUP BY\n  user_id,\n  name\nHAVING\n  COUNT(*) > 1\nORDER BY\n  created_at DESC\nLIMIT\n  10;\n\nUPDATE users\nSET\n  status = 'inactive'\nWHERE\n  last_login IS NULL;",
  db2: "SELECT\n  user_id,\n  name\nFROM\n  users\nWHERE\n  status = 'active'\n  AND created_at > '2026-01-01'\nGROUP BY\n  user_id,\n  name\nHAVING\n  COUNT(*) > 1\nORDER BY\n  created_at DESC\nLIMIT\n  10;\n\nUPDATE users\nSET\n  status = 'inactive'\nWHERE\n  last_login IS NULL;",
  n1ql: "SELECT\n  user_id,\n  name\nFROM\n  users\nWHERE\n  status = 'active'\n  AND created_at > '2026-01-01'\nGROUP BY\n  user_id,\n  name\nHAVING\n  COUNT(*) > 1\nORDER BY\n  created_at DESC\nLIMIT\n  10;\n\nUPDATE users\nSET\n  status = 'inactive'\nWHERE\n  last_login IS NULL;",
}

function opts(overrides: Partial<typeof DEFAULT_OPTIONS> = {}): typeof DEFAULT_OPTIONS {
  return { ...DEFAULT_OPTIONS, ...overrides }
}

describe('sqlEngine: 15 方言金样（验收 1）', () => {
  it('方言清单 = 规格顺序的 15 项', () => {
    expect(DIALECTS).toEqual([
      'sql',
      'mysql',
      'mariadb',
      'tidb',
      'postgresql',
      'plsql',
      'sqlite',
      'transactsql',
      'bigquery',
      'hive',
      'spark',
      'trino',
      'redshift',
      'db2',
      'n1ql',
    ])
  })

  for (const dialect of DIALECTS) {
    it(`方言 ${dialect}：金样确定性输出`, async () => {
      const res = await formatSql(GOLDEN_INPUT, opts({ dialect, keywordCase: 'upper' }))
      expect(res).toEqual({ ok: true, sql: GOLDEN[dialect] })
    })
  }

  it('同一输入改方言 → 输出随方言变化（存在多种金样形态）', async () => {
    const outputs = new Set<string>()
    for (const dialect of DIALECTS) {
      const res = await formatSql(GOLDEN_INPUT, opts({ dialect, keywordCase: 'upper' }))
      if (res.ok) outputs.add(res.sql)
    }
    expect(outputs.size).toBeGreaterThanOrEqual(2)
  })
})

describe('sqlEngine: 选项逐一生效（验收 2）', () => {
  it('缩进宽度 2/4/Tab', async () => {
    const input = 'select a from t where x > 1'
    const two = await formatSql(input, opts({ indent: '2' }))
    const four = await formatSql(input, opts({ indent: '4' }))
    const tab = await formatSql(input, opts({ indent: 'tab' }))
    expect(two).toEqual({ ok: true, sql: 'SELECT\n  a\nFROM\n  t\nWHERE\n  x > 1' })
    expect(four).toEqual({ ok: true, sql: 'SELECT\n    a\nFROM\n    t\nWHERE\n    x > 1' })
    expect(tab).toEqual({ ok: true, sql: 'SELECT\n\ta\nFROM\n\tt\nWHERE\n\tx > 1' })
  })

  it('关键字大小写 upper/preserve/lower', async () => {
    const input = 'select a from t'
    const upper = await formatSql(input, opts({ keywordCase: 'upper' }))
    const preserve = await formatSql(input, opts({ keywordCase: 'preserve' }))
    const lower = await formatSql(input, opts({ keywordCase: 'lower' }))
    expect(upper).toEqual({ ok: true, sql: 'SELECT\n  a\nFROM\n  t' })
    expect(preserve).toEqual({ ok: true, sql: 'select\n  a\nfrom\n  t' })
    expect(lower).toEqual({ ok: true, sql: 'select\n  a\nfrom\n  t' })
    // 大小写有可区分效果：与 preserve 不同
    expect(upper.ok && upper.sql).not.toBe(preserve.ok && preserve.sql)
  })

  it('表达式换行宽度（expressionWidth）', async () => {
    const input = 'select concat(aaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbb) from t'
    const narrow = await formatSql(input, opts({ expressionWidth: 10 }))
    const wide = await formatSql(input, opts({ expressionWidth: 100 }))
    // 窄宽度把实参列表拆行，宽宽度保持单行（标准方言函数名与括号间带空格）
    expect(narrow.ok && narrow.sql).toContain('(\n')
    expect(wide.ok && wide.sql).toContain('concat (aaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbb)')
  })

  it('多语句间空行数 0/1/5 三档（验收 3）', async () => {
    const input = 'select 1; select 2; select 3'
    const zero = await formatSql(input, opts({ linesBetweenQueries: 0 }))
    const one = await formatSql(input, opts({ linesBetweenQueries: 1 }))
    const five = await formatSql(input, opts({ linesBetweenQueries: 5 }))
    expect(zero).toEqual({ ok: true, sql: 'SELECT\n  1;\nSELECT\n  2;\nSELECT\n  3' })
    expect(one).toEqual({ ok: true, sql: 'SELECT\n  1;\n\nSELECT\n  2;\n\nSELECT\n  3' })
    expect(five.ok && five.sql).toBe(
      `SELECT\n  1;\n${'\n'.repeat(5)}SELECT\n  2;\n${'\n'.repeat(5)}SELECT\n  3`,
    )
  })

  it('运算符密集模式（denseOperators）', async () => {
    const input = 'select a = 1'
    const off = await formatSql(input, opts({ denseOperators: false }))
    const on = await formatSql(input, opts({ denseOperators: true }))
    expect(off).toEqual({ ok: true, sql: 'SELECT\n  a = 1' })
    expect(on).toEqual({ ok: true, sql: 'SELECT\n  a=1' })
  })

  it('identifierCase 无任何入口：选项面不含该键，传入被库忽略', async () => {
    expect(Object.keys(DEFAULT_OPTIONS)).not.toContain('identifierCase')
    // 即便恶意传入（绕过类型），引擎组装的 cfg 也不携带它
    const hostile = { ...opts(), identifierCase: 'upper' } as unknown as typeof DEFAULT_OPTIONS
    const res = await formatSql('select a from t', hostile)
    expect(res).toEqual({ ok: true, sql: 'SELECT\n  a\nFROM\n  t' })
  })
})

describe('sqlEngine: 尽力而为格式化（验收 4）', () => {
  it('词法可排版的垃圾输入 → 美化输出不报错', async () => {
    const res = await formatSql('select 1 --ok ???', opts())
    expect(res.ok).toBe(true)
  })

  it('词法崩溃输入 → 错误态 + 错误信息（调用方保留旧输出）', async () => {
    const res = await formatSql("select 'unclosed", opts())
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toContain('Parse error')
    }
  })

  it('空输入 → 空输出不报错', async () => {
    expect(await formatSql('', opts())).toEqual({ ok: true, sql: '' })
    expect(await formatSql('   \n  ', opts())).toEqual({ ok: true, sql: '' })
  })
})

describe('sqlEngine: 入口钳制', () => {
  it('expressionWidth 非正数被钳到合法区间（库要求正数）', async () => {
    expect(clampExpressionWidth(0)).toBe(1)
    expect(clampExpressionWidth(-5)).toBe(1)
    expect(clampExpressionWidth(9999)).toBe(200)
    const res = await formatSql('select a from t', opts({ expressionWidth: 0 }))
    expect(res.ok).toBe(true)
  })

  it('linesBetweenQueries 越界钳到 0–5', () => {
    expect(clampLinesBetween(-1)).toBe(0)
    expect(clampLinesBetween(7)).toBe(5)
    expect(clampLinesBetween(Number.NaN)).toBe(1)
  })
})
