/**
 * 假居民身份证号生成（结构真实口径，见 CONTEXT.md：结构真实）。
 *
 * 结构 = 真实省码（GB/T 2260 省级首两位集合）+ 随机合法出生日期（真实日历、
 * 含闰年、必为过去日期）+ 随机顺序码（3 位数字，全 0 合法）+ MOD 11-2 合法校验位。
 * 与身份证校验工具互指分工：那边验真，这边造「明确标注非真实」的测试数据——
 * 生成号码必须能通过结构校验才有测试价值，但绝不指向真实个人。
 *
 * 省码集合与校验算法是公开标准（GB/T 2260、GB 11643 / ISO 7064 MOD 11-2），
 * 本工具只降摩擦不添能力。随机源以 Rng 注入（默认 Math.random），不做种子复现。
 */

/** 随机源：返回 [0, 1) 均匀浮点。生产用 Math.random，测试注入确定性 PRNG。 */
export type Rng = () => number

/**
 * 省级行政区代码首两位（GB/T 2260 大陆 31 省，与身份证校验工具同口径；
 * 不含 71/81/82 港澳台）。市/区段不在本工具保证范围（跟随上游区划变更会腐烂），
 * 生成 4 位区段随机数字即可被「首两位 ∈ 省级集合」的结构校验接受。
 */
export const PROVINCE_CODES: readonly string[] = [
  '11', '12', '13', '14', '15',
  '21', '22', '23',
  '31', '32', '33', '34', '35', '36', '37',
  '41', '42', '43', '44', '45', '46',
  '50', '51', '52', '53', '54',
  '61', '62', '63', '64', '65',
]

/** MOD 11-2 加权因子（自左向右，作用于前 17 位，GB 11643）。 */
export const CHECK_WEIGHTS: readonly number[] = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]

/** MOD 11-2 余数映射：下标 = 加权和 mod 11（10 记作 X）。 */
export const CHECK_CHAR_MAP: readonly string[] = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']

/** 出生年份取值区间（含端点）：保证为过去日期且落在校验工具的 19xx/20xx 范围。 */
export const BIRTH_YEAR_MIN = 1950
export const BIRTH_YEAR_MAX = 2006

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30
  return 31
}

/** 计算前 17 位的 MOD 11-2 校验码（前置条件：body17 为 17 个 ASCII 数字）。 */
export function computeCheckDigit(body17: string): string {
  let sum = 0
  for (let i = 0; i < 17; i++) {
    sum += (body17.charCodeAt(i) - 48) * CHECK_WEIGHTS[i]!
  }
  return CHECK_CHAR_MAP[sum % 11]!
}

function randomInt(rng: Rng, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1))
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export interface GeneratedIdCard {
  /** 18 位号码（末位大写 X 形态） */
  number: string
  /** 出生日期段，规范形式 YYYY-MM-DD（供同批「日期合法」断言与展示） */
  birth: string
}

/** 生成一个结构真实的假身份证号：合法省码 + 合法日历日期 + 合法校验位。 */
export function generateIdCard(rng: Rng): GeneratedIdCard {
  const province = PROVINCE_CODES[Math.floor(rng() * PROVINCE_CODES.length)]!
  const city = String(randomInt(rng, 1, 20)).padStart(2, '0')
  const district = String(randomInt(rng, 1, 20)).padStart(2, '0')

  const year = randomInt(rng, BIRTH_YEAR_MIN, BIRTH_YEAR_MAX)
  const month = randomInt(rng, 1, 12)
  const day = randomInt(rng, 1, daysInMonth(year, month)) // 闰年 2 月 29 自然可得

  const sequence = String(randomInt(rng, 0, 999)).padStart(3, '0')

  const birthSegment = `${year}${pad2(month)}${pad2(day)}`
  const body17 = `${province}${city}${district}${birthSegment}${sequence}`
  return {
    number: `${body17}${computeCheckDigit(body17)}`,
    birth: `${year}-${pad2(month)}-${pad2(day)}`,
  }
}
