import { describe, expect, it } from 'vitest'
import {
  CHECK_CHAR_MAP,
  CHECK_WEIGHTS,
  PROVINCE_CODES,
  calcAge,
  computeCheckDigit,
  daysInMonth,
  isLeapYear,
  isValidDate,
  validateIdCard,
  validateLines,
} from './validator'

/**
 * 固定「当日」= 2026-10-29，保证年龄与未来日期断言确定。
 * validateIdCard / validateLines 的 now 参数用于注入。
 */
const NOW = new Date(2026, 9, 29)

/*
 * 校验码真值推算（MOD 11-2 / ISO 7064）：
 * 权重表（自左向右，17 位）：[7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
 * 余数映射（下标 = 加权和 mod 11）：['1','0','X','9','8','7','6','5','4','3','2']
 *
 * 例 1：前 17 位 11010519491231002
 *   加权和 = 1×7+1×9+0×10+1×5+0×8+5×4+1×2+9×1+4×6+9×3+1×7+2×9+3×10+1×5+0×8+0×4+2×2
 *         = 7+9+0+5+0+20+2+9+24+27+7+18+30+5+0+0+4 = 167
 *   167 mod 11 = 2 → 校验码 'X' → 11010519491231002X（规格验收 #1 的合法号）
 * 例 2：11010519491231001 → 加权和 = 165，165 mod 11 = 0 → '1' → 110105194912310011（男）
 * 例 3：11010520000229001 → 加权和 = 130，130 mod 11 = 9 → '3' → 110105200002290013（2000 闰年）
 * 例 4：96010119000229001 → 加权和 = 222，222 mod 11 = 2 → 'X' → 96010119000229001X
 *        （地区段 96 非法 + 出生日期 19000229 不存在，但校验码自洽 → 用于多错误并列）
 * 例 5：11010520261231001 → 加权和 = 137，137 mod 11 = 5 → '7' → 110105202612310017（未来日期）
 * 例 6：11010520261015001 → 加权和 = 119，119 mod 11 = 9 → '3' → 110105202610150013（恰好当日）
 * 例 7：11010519000229001 → 加权和 = 137 → '7' → 110105190002290017（1900 非闰年）
 * 例 8：11010520230229001 → 加权和 = 151，151 mod 11 = 8 → '4' → 110105202302290014（2023 非闰年）
 * 例 9：11010518000101001 → 加权和 = 67，67 mod 11 = 1 → '0' → 110105180001010010（年份超 19xx/20xx）
 * 例 10：65010119491231002 → 加权和 = 222 → 'X' → 65010119491231002X（65 新疆合法）
 * 例 11：00010119491231002 → 加权和 = 135，135 mod 11 = 3 → '9' → 000101194912310029（省码 00 非法）
 */

describe('校验码算法（MOD 11-2 / ISO 7064）', () => {
  it('权重表 17 项、余数映射 11 项', () => {
    expect(CHECK_WEIGHTS).toEqual([7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2])
    expect(CHECK_CHAR_MAP).toEqual(['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'])
  })

  it('手算真值：167→X、165→1、130→3（见文件头推算）', () => {
    expect(computeCheckDigit('11010519491231002')).toBe('X')
    expect(computeCheckDigit('11010519491231001')).toBe('1')
    expect(computeCheckDigit('11010520000229001')).toBe('3')
  })

  it('全部数字前 17 位返回数字或 X，不产生小写', () => {
    for (let i = 0; i < 12; i++) {
      const body = String(i).padStart(17, '0')
      expect(computeCheckDigit(body)).toMatch(/^[0-9X]$/)
    }
  })
})

describe('省级代码集合（硬编码，约 31 项）', () => {
  it('含 11（北京）与 65（新疆）；不含 96、00、71/81/82（港澳台不在大陆集合）', () => {
    expect(PROVINCE_CODES).toHaveLength(31)
    expect(PROVINCE_CODES).toContain('11')
    expect(PROVINCE_CODES).toContain('65')
    expect(PROVINCE_CODES).not.toContain('96')
    expect(PROVINCE_CODES).not.toContain('00')
    expect(PROVINCE_CODES).not.toContain('71')
    expect(PROVINCE_CODES).not.toContain('81')
    expect(PROVINCE_CODES).not.toContain('82')
  })
})

describe('日历工具（闰年按 4/100/400 规则）', () => {
  it('isLeapYear：2000 闰、1900 平、1988 闰、2023 平', () => {
    expect(isLeapYear(2000)).toBe(true)
    expect(isLeapYear(1900)).toBe(false)
    expect(isLeapYear(1988)).toBe(true)
    expect(isLeapYear(2023)).toBe(false)
  })

  it('daysInMonth：2 月随闰年，大小月边界', () => {
    expect(daysInMonth(2000, 2)).toBe(29)
    expect(daysInMonth(1900, 2)).toBe(28)
    expect(daysInMonth(2023, 2)).toBe(28)
    expect(daysInMonth(1949, 1)).toBe(31)
    expect(daysInMonth(1949, 4)).toBe(30)
  })

  it('isValidDate：合法/越界/闰日', () => {
    expect(isValidDate(1949, 12, 31)).toBe(true)
    expect(isValidDate(2000, 2, 29)).toBe(true)
    expect(isValidDate(1900, 2, 29)).toBe(false)
    expect(isValidDate(1949, 13, 1)).toBe(false)
    expect(isValidDate(1949, 0, 1)).toBe(false)
    expect(isValidDate(1949, 4, 31)).toBe(false)
    expect(isValidDate(1949, 12, 32)).toBe(false)
    expect(isValidDate(1949, 12, 0)).toBe(false)
  })
})

describe('18 位完整校验（GB 11643-1999）', () => {
  it('验收 #1：11010519491231002X 合法，解析 1949-12-31、女、年龄按当日', () => {
    const r = validateIdCard('11010519491231002X', NOW)
    expect(r.valid).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.kind).toBe('18')
    expect(r.parsed).toEqual({
      kind: '18',
      area: '110105',
      birth: '1949-12-31',
      birthYear: 1949,
      birthMonth: 12,
      birthDay: 31,
      sequence: '002',
      checkDigit: 'X',
      gender: 'female',
      age: 76, // 2026-10-29 时 12-31 生日未到：2026-1949-1
    })
  })

  it('验收 #6：X 大小写均可，解析统一为大写', () => {
    const r = validateIdCard('11010519491231002x', NOW)
    expect(r.valid).toBe(true)
    expect(r.parsed?.checkDigit).toBe('X')
  })

  it('验收 #2：末位改 1 → 仅「校验码不符」，其余段解析不受影响', () => {
    const r = validateIdCard('110105194912310021', NOW)
    expect(r.valid).toBe(false)
    expect(r.errors).toEqual([{ code: 'checkMismatch', segment: 'check', expected: 'X', actual: '1' }])
    expect(r.parsed).not.toBeNull()
    expect(r.parsed?.birth).toBe('1949-12-31')
    expect(r.parsed?.gender).toBe('female')
  })

  it('男：顺序码第 3 位奇数 → male（110105194912310011）', () => {
    const r = validateIdCard('110105194912310011', NOW)
    expect(r.valid).toBe(true)
    expect(r.parsed?.gender).toBe('male')
  })
})

describe('15 位旧号（无校验码，世纪按 19xx）', () => {
  it('验收 #3：110105491231002 合法（1949-12-31 女），无校验码', () => {
    const r = validateIdCard('110105491231002', NOW)
    expect(r.valid).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.kind).toBe('15')
    expect(r.parsed).toEqual({
      kind: '15',
      area: '110105',
      birth: '1949-12-31',
      birthYear: 1949,
      birthMonth: 12,
      birthDay: 31,
      sequence: '002',
      checkDigit: null,
      gender: 'female',
      age: 76,
    })
  })

  it('15 位第 15 位判性别：奇男偶女；末位变化只改性别不报校验码错误', () => {
    expect(validateIdCard('110105491231001', NOW).parsed?.gender).toBe('male')
    expect(validateIdCard('110105491231002', NOW).parsed?.gender).toBe('female')
    expect(validateIdCard('110105491231003', NOW).valid).toBe(true)
  })

  it('全 0 顺序码合法（规格仅要求 3 位数字），性别按偶数=女', () => {
    const r = validateIdCard('110105491231000', NOW)
    expect(r.valid).toBe(true)
    expect(r.parsed?.sequence).toBe('000')
    expect(r.parsed?.gender).toBe('female')
  })

  it('15 位日期段做真实日历校验：491331（13 月）非法', () => {
    const r = validateIdCard('110105491331002', NOW)
    expect(r.valid).toBe(false)
    expect(r.errors).toEqual([{ code: 'birthInvalid', segment: 'birth', date: '491331' }])
  })
})

describe('出生日期段', () => {
  it('2000 闰年：20000229 合法', () => {
    const r = validateIdCard('110105200002290013', NOW)
    expect(r.valid).toBe(true)
    expect(r.parsed?.birth).toBe('2000-02-29')
  })

  it('1900 非闰年：19000229 报日期非法（验收 #4），校验码自洽不额外报错', () => {
    const r = validateIdCard('110105190002290017', NOW)
    expect(r.valid).toBe(false)
    expect(r.errors).toEqual([{ code: 'birthInvalid', segment: 'birth', date: '19000229' }])
    expect(r.parsed).toBeNull()
  })

  it('2023 非闰年：20230229 报日期非法（验收 #4）', () => {
    const r = validateIdCard('110105202302290014', NOW)
    expect(r.errors).toEqual([{ code: 'birthInvalid', segment: 'birth', date: '20230229' }])
  })

  it('未来日期报「未来日期」；恰好当日不算未来', () => {
    const r = validateIdCard('110105202612310017', NOW)
    expect(r.errors).toEqual([{ code: 'birthFuture', segment: 'birth', date: '20261231' }])

    const sameDay = validateIdCard('110105202610150013', new Date(2026, 9, 15))
    expect(sameDay.valid).toBe(true)
    expect(sameDay.parsed?.age).toBe(0)
  })

  it('18 位年份限 19xx/20xx：1800 年报年份越界而非日期不存在', () => {
    const r = validateIdCard('110105180001010010', NOW)
    expect(r.errors).toEqual([
      { code: 'birthYearRange', segment: 'birth', year: 1800 },
    ])
  })
})

describe('地区段（省码集合）', () => {
  it('65 新疆合法', () => {
    const r = validateIdCard('65010119491231002X', NOW)
    expect(r.valid).toBe(true)
    expect(r.parsed?.area).toBe('650101')
  })

  it('00 省码非法：定位地区段并给出前两位（验收 #5）', () => {
    const r = validateIdCard('000101194912310029', NOW)
    expect(r.errors).toEqual([{ code: 'area', segment: 'area', prefix: '00' }])
    expect(r.parsed).toBeNull()
  })
})

describe('非数字字符定位（charset，段级）', () => {
  it('地区段含字母：定位第 1 位 "A"，该段跳过省级校验', () => {
    const r = validateIdCard('A1010519491231002X', NOW)
    expect(r.errors).toEqual([{ code: 'charset', segment: 'area', char: 'A', position: 1 }])
    expect(r.parsed).toBeNull()
  })

  it('出生日期段含字母：定位第 11 位', () => {
    const r = validateIdCard('1101051949A231002X', NOW)
    expect(r.errors).toEqual([{ code: 'charset', segment: 'birth', char: 'A', position: 11 }])
  })

  it('顺序码含字母：18 位定位第 16 位；15 位定位第 14 位', () => {
    const r18 = validateIdCard('110105194912310A2X', NOW)
    expect(r18.errors).toEqual([{ code: 'charset', segment: 'sequence', char: 'A', position: 16 }])

    const r15 = validateIdCard('1101054912310A2', NOW)
    expect(r15.errors).toEqual([{ code: 'charset', segment: 'sequence', char: 'A', position: 14 }])
  })

  it('校验码段含非 0-9X 字符：定位第 18 位', () => {
    const r = validateIdCard('11010519491231002G', NOW)
    expect(r.errors).toEqual([{ code: 'charset', segment: 'check', char: 'G', position: 18 }])
  })

  it('多个段各含非数字字符 → 全部并列定位；主体非纯数字则不算校验码', () => {
    const r = validateIdCard('A10105194912B1002X', NOW)
    expect(r.errors).toEqual([
      { code: 'charset', segment: 'area', char: 'A', position: 1 },
      { code: 'charset', segment: 'birth', char: 'B', position: 13 },
    ])
  })
})

describe('结构化错误清单：多处错误并列输出（不只第一个）', () => {
  it('验收 #5：省码 96 非法 + 19000229 日期非法，两条并列、各定位到段', () => {
    const r = validateIdCard('96010119000229001X', NOW)
    expect(r.valid).toBe(false)
    expect(r.kind).toBe('18')
    expect(r.errors).toEqual([
      { code: 'area', segment: 'area', prefix: '96' },
      { code: 'birthInvalid', segment: 'birth', date: '19000229' },
    ])
    expect(r.parsed).toBeNull()
  })

  it('地区 + 日期 + 校验码三类错误同时并列（末位不自洽）', () => {
    // 主体同例 4（加权和 222 → 期望 'X'），末位改为 '1' → 校验码不符
    const r = validateIdCard('960101190002290011', NOW)
    expect(r.errors).toEqual([
      { code: 'area', segment: 'area', prefix: '96' },
      { code: 'birthInvalid', segment: 'birth', date: '19000229' },
      { code: 'checkMismatch', segment: 'check', expected: 'X', actual: '1' },
    ])
  })
})

describe('长度非法（既非 15 也非 18）', () => {
  const cases: Array<[string, number]> = [
    ['11010519491231', 14],
    ['1101051949123100', 16],
    ['11010519491231002', 17],
    ['11010519491231002XX', 19],
  ]
  it.each(cases)('%i 位 → 仅一条长度错误', (input, length) => {
    const r = validateIdCard(input, NOW)
    expect(r.valid).toBe(false)
    expect(r.kind).toBeNull()
    expect(r.parsed).toBeNull()
    expect(r.errors).toEqual([{ code: 'length', segment: null, length }])
  })

  it('含分隔符 → 长度非法（验收 #6：分隔符计入长度）', () => {
    const r = validateIdCard('110105-19491231002X', NOW)
    expect(r.errors).toEqual([{ code: 'length', segment: null, length: 19 }])
  })

  it('首尾空白忽略，不改变判定', () => {
    expect(validateIdCard('  11010519491231002X \n', NOW).valid).toBe(true)
  })
})

describe('calcAge（按当日整岁）', () => {
  it('生日未到减一、已过不减、当日算满', () => {
    expect(calcAge(1949, 12, 31, NOW)).toBe(76) // 2026-10-29，12-31 未到
    expect(calcAge(1949, 12, 31, new Date(2026, 11, 31))).toBe(77)
    expect(calcAge(1949, 10, 29, NOW)).toBe(77) // 恰好生日当天
    expect(calcAge(1949, 10, 30, NOW)).toBe(76)
    expect(calcAge(2026, 10, 15, new Date(2026, 9, 15))).toBe(0)
  })
})

describe('批量 validateLines（逐行独立、空行忽略、行号定位）', () => {
  it('验收 #7：3 行混合结果逐行输出正确，空行忽略且保留原始行号', () => {
    const input = '11010519491231002X\n\n110105194912310021\n110105491231002\n'
    const rows = validateLines(input, NOW)
    expect(rows.map((r) => r.line)).toEqual([1, 3, 4])
    expect(rows.map((r) => r.result.valid)).toEqual([true, false, true])
    expect(rows[0]!.input).toBe('11010519491231002X')
    expect(rows[1]!.result.errors[0]?.code).toBe('checkMismatch')
    expect(rows[2]!.result.kind).toBe('15')
  })

  it('CRLF 与 CR 同样按行切分', () => {
    const rows = validateLines('11010519491231002X\r\n110105491231002', NOW)
    expect(rows.map((r) => r.line)).toEqual([1, 2])
    const rowsCr = validateLines('11010519491231002X\r110105491231002', NOW)
    expect(rowsCr.map((r) => r.line)).toEqual([1, 2])
  })

  it('行内首尾空白忽略；纯空白输入 → 空结果', () => {
    const rows = validateLines('  11010519491231002X  ', NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.result.valid).toBe(true)
    expect(validateLines('', NOW)).toEqual([])
    expect(validateLines(' \n\t\r\n  ', NOW)).toEqual([])
  })

  it('各行结果完全独立：一行的错误不影响另一行', () => {
    const rows = validateLines('96010119000229001X\n11010519491231002X', NOW)
    expect(rows[0]!.result.errors).toHaveLength(2)
    expect(rows[1]!.result.valid).toBe(true)
  })
})
