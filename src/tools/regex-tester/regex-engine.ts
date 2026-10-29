/**
 * 正则测试器纯逻辑模块（零第三方依赖）。
 *
 * 语义口径见 CONTEXT.md 与规格票据 04：
 * - 仅原生 RegExp（JS 语义），匹配索引一律为 UTF-16 code unit 偏移；
 * - 零宽匹配（Zero-width Match）：不消耗字符，防死循环靠命中后手动 +1 推进；
 * - 灾难性回溯（ReDoS）防护：本模块内做迭代间超时自查（注入时钟可测），
 *   Worker 层由主线程 1.5s 未响应即 terminate 兜底（见 match-client.ts）；
 * - 替换模板（Replacement Template）：仅 String.prototype.replace 的 $ 语义，不执行函数。
 *
 * 本模块不感知 Worker：`executeRequest` 是消息协议的纯函数形态，
 * match.worker.ts 只做「收消息 → executeRequest → 回消息」。
 */

// ============================================================
// 常量与标志
// ============================================================

/** 单次运行匹配数硬上限（达到即停止并标注截断）。 */
export const MAX_MATCHES = 5000
/** 测试文本硬上限：1 MiB（UTF-8 字节），超限自动截断参与匹配并提示截断量。 */
export const MAX_TEXT_BYTES = 1024 * 1024
/** 单次运行超时（毫秒）：主线程 terminate 与 Worker 内自查共用同一口径。 */
export const TIMEOUT_MS = 1500

export type RegexFlag = 'g' | 'i' | 'm' | 's' | 'u' | 'y' | 'd' | 'v'

/** 全部候选标志（UI 复选框集合；运行时不支持的由 probeSupportedFlags 隐藏）。 */
export const ALL_FLAGS: readonly RegexFlag[] = ['g', 'i', 'm', 's', 'u', 'y', 'd', 'v']

/** 默认仅开启全局匹配。 */
export const DEFAULT_FLAGS: readonly RegexFlag[] = ['g']

/**
 * 运行时标志支持探测：逐个尝试构造，失败即视为该运行时不支持（旧 WebView）。
 * 规格要求：`v` 仅探测支持时显示，其余标志不支持时同样隐藏。
 */
export function probeSupportedFlags(): RegexFlag[] {
  const supported: RegexFlag[] = []
  for (const f of ALL_FLAGS) {
    try {
      new RegExp('a', f)
      supported.push(f)
    } catch {
      // 该运行时不支持此标志 → 隐藏
    }
  }
  return supported
}

// ============================================================
// Worker 消息协议（主线程 ↔ Worker 共享类型）
// ============================================================

/** 主线程 → Worker：一次匹配运行请求。 */
export interface MatchRequest {
  pattern: string
  /** 如 'gi'；空串合法（非全局单次匹配） */
  flags: string
  text: string
  /** 存在时由 Worker 一并计算替换预览（String.replace 语义，不执行函数） */
  replacement?: string
}

/** 一条匹配记录。索引为 UTF-16 code unit 偏移；区间 [index, end)。 */
export interface MatchItem {
  index: number
  end: number
  /** 完整匹配文本；零宽匹配为 '' */
  text: string
  /** 编号捕获组 1..n 的值；未参与匹配为 undefined */
  groups: Array<string | undefined>
  /** 命名捕获组：键恒为模式中全部命名组，未参与匹配值为 undefined */
  named: Record<string, string | undefined>
  /** d 标志开启时存在：匹配位置索引（[0] 为整体匹配，其余按编号组） */
  indices?: Array<[number, number] | undefined>
}

/** 模式分组结构元信息（取自首个匹配；零匹配时为零值）。 */
export interface GroupsMeta {
  /** 编号捕获组数量（不含整体匹配 0 号） */
  count: number
  /** 命名组名列表（按模式中定义顺序） */
  named: string[]
}

/** Worker → 主线程：一次匹配运行结果。 */
export interface MatchResponse {
  matches: MatchItem[]
  groupsMeta: GroupsMeta
  /** 匹配数达到 5000 上限被截断 */
  truncated: boolean
  /** 输入文本超过 1 MiB，已在码点边界截断后参与匹配 */
  textTruncated: boolean
  /** 文本截断移除的字符数（码点口径），未截断为 0 */
  removedChars: number
  timedOut: boolean
  durationMs: number
  /** 非法模式等错误的原始 JS message；无错误为 null */
  error: string | null
  /** 替换预览结果；未请求 / 出错 / 超时时为 null */
  replacement: string | null
}

// ============================================================
// 文本上限（1 MiB，码点边界截断）
// ============================================================

export interface TextLimitResult {
  /** 截断后参与匹配的文本（未超限时与输入相同） */
  text: string
  truncated: boolean
  /** 移除的字符数（码点口径） */
  removedChars: number
}

function utf8ByteLen(cp: number): number {
  if (cp <= 0x7f) return 1
  if (cp <= 0x7ff) return 2
  if (cp <= 0xffff) return 3
  return 4
}

/**
 * 文本上限：超过 1 MiB（UTF-8 字节）时在码点边界截断，绝不产生半个字符。
 * 快路径：UTF-8 字节数 ≤ 3 × UTF-16 code unit 数，短于该上界的输入必然安全。
 */
export function enforceTextLimit(text: string): TextLimitResult {
  if (text.length * 3 <= MAX_TEXT_BYTES) {
    return { text, truncated: false, removedChars: 0 }
  }
  let bytes = 0
  let end = 0
  let kept = 0
  let total = 0
  let truncated = false
  for (const ch of text) {
    total++
    if (truncated) continue
    const b = utf8ByteLen(ch.codePointAt(0)!)
    if (bytes + b > MAX_TEXT_BYTES) {
      truncated = true
      continue
    }
    bytes += b
    end += ch.length
    kept++
  }
  if (!truncated) return { text, truncated: false, removedChars: 0 }
  return { text: text.slice(0, end), truncated: true, removedChars: total - kept }
}

// ============================================================
// 模式构建
// ============================================================

/** 构建原生 RegExp；非法模式 / 未知标志直接抛出 JS 错误（由调用方捕获透传）。 */
export function buildRegExp(pattern: string, flags: string): RegExp {
  return new RegExp(pattern, flags)
}

/** 错误信息透传（原始 JS message，本地化前缀由 UI 负责）。 */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// ============================================================
// 匹配编排
// ============================================================

export interface RunOptions {
  /** 匹配数上限（默认 MAX_MATCHES，测试可注入小值） */
  maxMatches?: number
  /** 时钟注入点：默认 Date.now。超时自查 = now() - start >= TIMEOUT_MS */
  now?: () => number
}

export interface RunOutcome {
  ok: boolean
  matches: MatchItem[]
  groupsMeta: GroupsMeta
  truncated: boolean
  timedOut: boolean
  durationMs: number
  error: string | null
}

function toItem(m: RegExpExecArray, hasIndices: boolean): MatchItem {
  const groups: Array<string | undefined> = []
  for (let i = 1; i < m.length; i++) groups.push(m[i])
  const item: MatchItem = {
    index: m.index,
    end: m.index + m[0].length,
    text: m[0],
    groups,
    named: {},
  }
  if (m.groups) {
    // V8 保证 groups 对象含全部命名组键（未参与匹配值为 undefined）
    for (const name of Object.keys(m.groups)) item.named[name] = m.groups[name]
  }
  if (hasIndices && m.indices) {
    item.indices = m.indices.map((v) => (v ? [v[0], v[1]] : undefined))
  }
  return item
}

function groupsMetaFromMatch(m: RegExpExecArray): GroupsMeta {
  const named = m.groups ? Object.keys(m.groups) : []
  return { count: Math.max(m.length - 1, 0), named }
}

/**
 * 匹配执行编排（纯函数，可注入时钟测试超时终止语义）：
 * - `g`：循环执行，零宽匹配 lastIndex 不前进时手动 +1 推进（防死循环）；
 * - `y`：粘连语义由 RegExp 自身保证（只在 lastIndex 尝试）；无 `g` 时仅一次尝试；
 * - 非 `g`：忠实 String.match 行为，仅报告第一个匹配；
 * - 达到匹配数上限后再探测一次：确有更多才标 truncated（恰好 5000 不误报）；
 * - 每次执行前检查注入时钟，超 1.5s 即终止循环并标 timedOut。
 */
export function runMatch(pattern: string, flags: string, text: string, options: RunOptions = {}): RunOutcome {
  const now = options.now ?? Date.now
  const maxMatches = options.maxMatches ?? MAX_MATCHES
  const start = now()

  let re: RegExp
  try {
    re = buildRegExp(pattern, flags)
  } catch (e) {
    return {
      ok: false,
      matches: [],
      groupsMeta: { count: 0, named: [] },
      truncated: false,
      timedOut: false,
      durationMs: now() - start,
      error: errorMessage(e),
    }
  }

  const limited = enforceTextLimit(text)
  const matches: MatchItem[] = []
  let groupsMeta: GroupsMeta = { count: 0, named: [] }
  let truncated = false
  let timedOut = false

  try {
    if (re.global) {
      for (;;) {
        if (now() - start >= TIMEOUT_MS) {
          timedOut = true
          break
        }
        const m = re.exec(limited.text)
        if (m === null) break
        if (matches.length >= maxMatches) {
          truncated = true // 上限后仍探到匹配：确有更多
          break
        }
        matches.push(toItem(m, re.hasIndices))
        if (matches.length === 1) groupsMeta = groupsMetaFromMatch(m)
        // 零宽匹配防死循环：lastIndex 未前进则手动 +1（UTF-16 code unit 步进）
        if (re.lastIndex === m.index) {
          re.lastIndex = m.index + 1
          if (re.lastIndex > limited.text.length) break
        }
      }
    } else {
      // 非 g（含 y 粘连单次尝试）：仅报告第一个匹配
      if (now() - start >= TIMEOUT_MS) {
        timedOut = true
      } else {
        const m = re.exec(limited.text)
        if (m !== null) {
          matches.push(toItem(m, re.hasIndices))
          groupsMeta = groupsMetaFromMatch(m)
        }
      }
    }
  } catch (e) {
    // 运行中异常（如栈溢出）：保留已收集的部分并透传错误
    return {
      ok: false,
      matches,
      groupsMeta,
      truncated,
      timedOut,
      durationMs: now() - start,
      error: errorMessage(e),
    }
  }

  return {
    ok: true,
    matches,
    groupsMeta,
    truncated,
    timedOut,
    durationMs: now() - start,
    error: null,
  }
}

// ============================================================
// 替换预览（String.prototype.replace 语义，不执行任何函数）
// ============================================================

export interface ReplaceOutcome {
  ok: boolean
  result: string
  error: string | null
}

/**
 * 替换预览：直接委托 String.prototype.replace，保证 $1 / $<name> / $& / $$ /
 * $` / $' 等模板语义与 JS 完全一致；全部替换与否由 `g` 标志决定。
 * 文本同样先过 1 MiB 上限（与匹配口径一致）。
 */
export function previewReplacement(
  pattern: string,
  flags: string,
  text: string,
  replacement: string,
): ReplaceOutcome {
  let re: RegExp
  try {
    re = buildRegExp(pattern, flags)
  } catch (e) {
    return { ok: false, result: '', error: errorMessage(e) }
  }
  try {
    return { ok: true, result: enforceTextLimit(text).text.replace(re, replacement), error: null }
  } catch (e) {
    return { ok: false, result: '', error: errorMessage(e) }
  }
}

// ============================================================
// 编排入口（Worker 调用；主线程超时兜底见 match-client.ts）
// ============================================================

/** 主线程超时 terminate 后构造的空响应（Worker 未及回话）。 */
export function timeoutResponse(): MatchResponse {
  return {
    matches: [],
    groupsMeta: { count: 0, named: [] },
    truncated: false,
    textTruncated: false,
    removedChars: 0,
    timedOut: true,
    durationMs: TIMEOUT_MS,
    error: null,
    replacement: null,
  }
}

/** 消息协议的纯函数形态：一个请求 → 一个响应（match.worker.ts 唯一依赖）。 */
export function executeRequest(req: MatchRequest, options: RunOptions = {}): MatchResponse {
  const outcome = runMatch(req.pattern, req.flags, req.text, options)
  const limit = enforceTextLimit(req.text)

  let replacement: string | null = null
  // 非法模式或已超时的请求绝不延伸执行替换（防二次回溯）
  if (typeof req.replacement === 'string' && outcome.ok && !outcome.timedOut) {
    const rep = previewReplacement(req.pattern, req.flags, req.text, req.replacement)
    if (rep.ok) replacement = rep.result
  }

  return {
    matches: outcome.matches,
    groupsMeta: outcome.groupsMeta,
    truncated: outcome.truncated,
    textTruncated: limit.truncated,
    removedChars: limit.removedChars,
    timedOut: outcome.timedOut,
    durationMs: outcome.durationMs,
    error: outcome.error,
    replacement,
  }
}
