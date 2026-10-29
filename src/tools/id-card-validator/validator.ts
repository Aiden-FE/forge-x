/**
 * 身份证号校验纯逻辑模块（零第三方依赖、零内置数据文件）。
 *
 * 术语与口径见 CONTEXT.md：
 * - 居民身份证号：18 位（现行）或 15 位（旧式），地区段 + 出生日期段 + 顺序码段；
 *   18 位末位为校验码，15 位无校验码。只做结构合法性校验，不判断号码是否真实存在。
 * - 校验码（Check Digit）：前 17 位按 ISO 7064 MOD 11-2 算出的第 18 位（数字或 X）。
 * - 顺序码（Sequence Code）：出生日期段后的 3 位登记顺序号，末位奇男偶女。
 *
 * 规格决策（.scratch/hot-tools-v0.3.0/issues/10）：
 * - 省级代码集合硬编码（约 31 项），不内置区划名称表——区划年年变更，
 *   严格校验必然过时误判；市/区段仅验数字格式。
 * - 一次校验返回所有可判定的段级错误（不只第一个），每条定位到段。
 * - 校验码错误不影响其余段解析；段内含非数字字符时跳过该段的语义校验。
 * - 全 0 顺序码合法（规格对顺序码仅要求「3 位数字」）。
 */

/** 省级行政区代码首两位（GB/T 2260 大陆 31 省，硬编码；不含 71/81/82 港澳台）。 */
export const PROVINCE_CODES: readonly string[] = [
  '11', '12', '13', '14', '15',
  '21', '22', '23',
  '31', '32', '33', '34', '35', '36', '37',
  '41', '42', '43', '44', '45', '46',
  '50', '51', '52', '53', '54',
  '61', '62', '63', '64', '65',
]

const PROVINCE_SET: ReadonlySet<string> = new Set(PROVINCE_CODES)

/** MOD 11-2 加权因子（自左向右，作用于前 17 位）。 */
export const CHECK_WEIGHTS: readonly number[] = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]

/** MOD 11-2 余数映射：下标 = 加权和 mod 11（10 记作 X）。 */
export const CHECK_CHAR_MAP: readonly string[] = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']

/**
 * 计算前 17 位的 MOD 11-2 校验码（ISO 7064）。
 * 前置条件：body17 为 17 个 ASCII 数字（调用方先做字符集校验）。
 */
export function computeCheckDigit(body17: string): string {
  let sum = 0
  for (let i = 0; i < 17; i++) {
    sum += (body17.charCodeAt(i) - 48) * CHECK_WEIGHTS[i]!
  }
  return CHECK_CHAR_MAP[sum % 11]!
}

// ---- 日历 ----

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30
  return 31
}

export function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false
  if (day < 1 || day > daysInMonth(year, month)) return false
  return true
}

/** 晚于当日（本地时区年月日比较）才算未来；恰好当日不算未来。 */
function isFutureDate(year: number, month: number, day: number, now: Date): boolean {
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const d = now.getDate()
  return year > y || (year === y && (month > m || (month === m && day > d)))
}

/** 按当日计整岁：生日未到减一，当日即算满。 */
export function calcAge(birthYear: number, birthMonth: number, birthDay: number, now: Date): number {
  const m = now.getMonth() + 1
  const d = now.getDate()
  const beforeBirthday = m < birthMonth || (m === birthMonth && d < birthDay)
  return now.getFullYear() - birthYear - (beforeBirthday ? 1 : 0)
}

// ---- 结构化结果 ----

/** 错误定位到的段；长度非法时无法分段，为 null。 */
export type IdCardSegment = 'area' | 'birth' | 'sequence' | 'check'

export type IdCardErrorCode =
  | 'length' // 长度既非 15 也非 18
  | 'charset' // 段内含非数字字符（校验码段允许 X/x）
  | 'area' // 首两位不在省级集合
  | 'birthInvalid' // 日期不存在（含闰年）
  | 'birthFuture' // 晚于当日
  | 'birthYearRange' // 18 位年份不在 19xx/20xx
  | 'checkMismatch' // 校验码不符（仅 18 位）

export interface IdCardError {
  code: IdCardErrorCode
  /** 错误所在段；length 错误为 null */
  segment: IdCardSegment | null
  /** length：实际长度 */
  length?: number
  /** charset：首个非法字符与其 1-based 全号位置 */
  char?: string
  position?: number
  /** area：不在省级集合的首两位 */
  prefix?: string
  /** birthInvalid/birthFuture：出生日期段原文（YYYYMMDD 或 YYMMDD） */
  date?: string
  /** birthYearRange：越界年份 */
  year?: number
  /** checkMismatch：期望值与实际值（统一大写 X） */
  expected?: string
  actual?: string
}

export type IdCardKind = '18' | '15'
export type Gender = 'male' | 'female'

export interface ParsedIdCard {
  kind: IdCardKind
  /** 地区段原文（6 位数字） */
  area: string
  /** 出生日期，规范形式 YYYY-MM-DD */
  birth: string
  birthYear: number
  birthMonth: number
  birthDay: number
  /** 顺序码原文（3 位数字） */
  sequence: string
  /** 号码自身的校验码（大写）；15 位无校验码为 null */
  checkDigit: string | null
  gender: Gender
  /** 按校验时刻整岁计算 */
  age: number
}

export interface IdCardValidation {
  valid: boolean
  kind: IdCardKind | null
  /**
   * 解析结果：地区/日期/顺序码均可判定即给出（校验码不符不影响解析）；
   * 任一这些段非法或长度非法时为 null。
   */
  parsed: ParsedIdCard | null
  /** 结构化错误清单：所有可判定的段级错误并列 */
  errors: IdCardError[]
}

export interface IdCardLineResult {
  /** 1-based 原始行号（空行忽略但不改变后续行号） */
  line: number
  /** 去除首尾空白后的该行原文 */
  input: string
  result: IdCardValidation
}

// ---- 内部工具 ----

function firstNonDigitIndex(value: string): number {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    if (c < 48 /* 0 */ || c > 57 /* 9 */) return i
  }
  return -1
}

/** 校验码段允许 0-9 与 X/x。 */
function firstBadCheckCharIndex(value: string): number {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    const digit = c >= 48 && c <= 57
    const x = c === 88 /* X */ || c === 120 /* x */
    if (!digit && !x) return i
  }
  return -1
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

// ---- 单号校验 ----

/**
 * 校验单个身份证号（去除首尾空白后）。
 *
 * 流程：长度 → 各段字符集 → 地区段省级集合 → 出生日期（范围/真实日历/未来）→
 * 校验码（仅 18 位）。charset 错误优先按段序（地区/日期/顺序码/校验码）并列输出，
 * 其后为段级语义错误（地区、日期），最后是校验码不符。
 * 含 charset 错误的段跳过后续语义校验；主体含非数字字符时不计算校验码。
 */
export function validateIdCard(raw: string, now: Date = new Date()): IdCardValidation {
  const input = raw.trim()
  if (input.length !== 15 && input.length !== 18) {
    return {
      valid: false,
      kind: null,
      parsed: null,
      errors: [{ code: 'length', segment: null, length: input.length }],
    }
  }

  const kind: IdCardKind = input.length === 18 ? '18' : '15'
  const area = input.slice(0, 6)
  const birthRaw = kind === '18' ? input.slice(6, 14) : input.slice(6, 12)
  const sequence = kind === '18' ? input.slice(14, 17) : input.slice(12, 15)
  const checkRaw = kind === '18' ? input.slice(17, 18) : null
  const seqOffset = kind === '18' ? 14 : 12

  const errors: IdCardError[] = []

  // 1) 字符集：数字段逐段定位，非纯数字的段跳过语义校验
  const digitSegments: Array<{ segment: IdCardSegment; value: string; offset: number }> = [
    { segment: 'area', value: area, offset: 0 },
    { segment: 'birth', value: birthRaw, offset: 6 },
    { segment: 'sequence', value: sequence, offset: seqOffset },
  ]
  let bodyClean = true // 地区/日期/顺序码均为纯数字（校验码计算的前置条件）
  for (const { segment, value, offset } of digitSegments) {
    const bad = firstNonDigitIndex(value)
    if (bad !== -1) {
      errors.push({ code: 'charset', segment, char: value[bad], position: offset + bad + 1 })
      bodyClean = false
    }
  }
  let checkClean = true
  if (checkRaw !== null) {
    const bad = firstBadCheckCharIndex(checkRaw)
    if (bad !== -1) {
      errors.push({ code: 'charset', segment: 'check', char: checkRaw[bad], position: 18 + bad })
      checkClean = false
    }
  }

  // 2) 地区段：首两位 ∈ 省级集合（市/区段仅验过数字格式）
  if (bodyClean && !PROVINCE_SET.has(area.slice(0, 2))) {
    errors.push({ code: 'area', segment: 'area', prefix: area.slice(0, 2) })
  }

  // 3) 出生日期段：18 位年份限 19xx/20xx → 真实日历（含闰年）→ 不得晚于当日
  let birth: { year: number; month: number; day: number } | null = null
  if (bodyClean) {
    const year = kind === '18' ? Number(birthRaw.slice(0, 4)) : 1900 + Number(birthRaw.slice(0, 2))
    const month = kind === '18' ? Number(birthRaw.slice(4, 6)) : Number(birthRaw.slice(2, 4))
    const day = kind === '18' ? Number(birthRaw.slice(6, 8)) : Number(birthRaw.slice(4, 6))
    if (kind === '18' && (year < 1900 || year > 2099)) {
      errors.push({ code: 'birthYearRange', segment: 'birth', year })
    } else if (!isValidDate(year, month, day)) {
      errors.push({ code: 'birthInvalid', segment: 'birth', date: birthRaw })
    } else if (isFutureDate(year, month, day, now)) {
      errors.push({ code: 'birthFuture', segment: 'birth', date: birthRaw })
    } else {
      birth = { year, month, day }
    }
  }

  // 4) 校验码（仅 18 位）：与主体段独立，错误不影响其余段解析
  let checkDigit: string | null = null
  if (kind === '18' && bodyClean && checkClean) {
    const expected = computeCheckDigit(input.slice(0, 17))
    checkDigit = checkRaw!.toUpperCase()
    if (checkDigit !== expected) {
      errors.push({ code: 'checkMismatch', segment: 'check', expected, actual: checkDigit })
    }
  }

  // 5) 解析：校验码不符不影响；地区/日期/顺序码任一非法则无法解析
  const fatal = errors.some((e) => e.code !== 'checkMismatch')
  const parsed =
    !fatal && birth
      ? {
          kind,
          area,
          birth: `${birth.year}-${pad2(birth.month)}-${pad2(birth.day)}`,
          birthYear: birth.year,
          birthMonth: birth.month,
          birthDay: birth.day,
          sequence,
          checkDigit,
          gender: (sequence.charCodeAt(2) - 48) % 2 === 1 ? ('male' as const) : ('female' as const),
          age: calcAge(birth.year, birth.month, birth.day, now),
        }
      : null

  return { valid: errors.length === 0, kind, parsed, errors }
}

const LINE_SPLIT_RE = /\r\n|\n|\r/

/**
 * 批量逐行校验：按 \r\n / \n / \r 切分，行内首尾空白忽略，
 * 空行（含纯空白）忽略但保留原始行号，各行结果完全独立。
 */
export function validateLines(input: string, now: Date = new Date()): IdCardLineResult[] {
  const rows: IdCardLineResult[] = []
  const lines = input.split(LINE_SPLIT_RE)
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim()
    if (trimmed === '') continue
    rows.push({ line: i + 1, input: trimmed, result: validateIdCard(trimmed, now) })
  }
  return rows
}
