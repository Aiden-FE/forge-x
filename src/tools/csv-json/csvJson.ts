/**
 * CSV↔JSON conversion logic (pure, UI-free).
 *
 * Parsing/serializing is done with papaparse, loaded lazily via dynamic
 * import on first use (platform rule: it must never enter the entry bundle).
 * All functions are async and return result objects instead of throwing so
 * the UI and the worker can render structured, localized error lists.
 *
 * Core semantics (see .scratch/hot-tools-v0.3.0/issues/12-csv-json-spec.md):
 * - Strict RFC 4180: no lenient-quote mode; `""` escapes; newlines inside
 *   quoted fields are legal; BOM stripped; CRLF/LF/CR row breaks.
 * - Value fidelity: every field enters JSON as a string (no dynamic typing),
 *   so `007`, `3.10` and ID numbers never change shape.
 * - JSON→CSV accepts only a top-level array (objects or arrays); column set
 *   is the union of all object keys in first-occurrence order; missing keys
 *   and `null` become empty fields; nested values produce structured errors.
 */

/** Paste (textarea) input limit in UTF-8 bytes: 1 MiB. */
export const PASTE_MAX_BYTES = 1024 * 1024
/** Imported file limit in bytes: 10 MiB. */
export const FILE_MAX_BYTES = 10 * 1024 * 1024
/** Chunk size used by the streaming parse inside the worker. */
export const STREAM_CHUNK_SIZE = 1024 * 1024

const MAX_REPORTED_ERRORS = 20

export type NewlineStyle = '\r\n' | '\n' | '\r'

export type DelimiterChoice = 'auto' | ',' | ';' | '\t' | '|' | ' '

export type CsvJsonErrorCode =
  | 'empty'
  | 'unclosedQuote'
  | 'csvParse'
  | 'jsonParse'
  | 'notArray'
  | 'invalidRow'
  | 'nestedValue'
  | 'pasteTooLarge'
  | 'fileTooLarge'

export interface CsvJsonError {
  code: CsvJsonErrorCode
  /** Underlying parser message, kept for the generic parse errors. */
  message?: string
  /** 1-based physical line in the input text. */
  line?: number
  /** 1-based column in the input text. */
  column?: number
  /** Offending object key (JSON→CSV), or 1-based column label for array rows. */
  key?: string
  /** 1-based item index in the top-level JSON array. */
  row?: number
}

export interface CsvToJsonOptions {
  delimiter?: DelimiterChoice
  header?: boolean
  /** Streaming only: override the chunk size (tests, tuning). */
  chunkSize?: number
}

export interface JsonToCsvOptions {
  newline?: NewlineStyle
  delimiter?: string
  /** Append the row terminator after the final row (round-trip fidelity). */
  ensureTrailingNewline?: boolean
}

export type CsvToJsonOutcome =
  | { ok: true; json: string }
  | { ok: false; errors: CsvJsonError[] }

export type JsonToCsvOutcome =
  | { ok: true; csv: string }
  | { ok: false; errors: CsvJsonError[] }

const DELIMITER_CANDIDATES = [',', ';', '\t', '|', ' '] as const

const BOM = '\uFEFF'

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

export function isFileWithinLimit(bytes: number): boolean {
  return bytes >= 0 && bytes <= FILE_MAX_BYTES
}

/* ------------------------------------------------------------------ *
 * Dialect detection and position helpers
 * ------------------------------------------------------------------ */

export function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text
}

/**
 * Detect the delimiter among the spec'd candidates (`,` `;` `\t` `|` space)
 * by counting occurrences outside quoted fields on each line; the candidate
 * with the highest minimum count wins, ties keep candidate order.
 */
export function detectDelimiter(text: string): (typeof DELIMITER_CANDIDATES)[number] {
  const lines = stripBom(text)
    .split(/\r\n|\r|\n/)
    .filter((line) => line.length > 0)
    .slice(0, 10)

  let best: (typeof DELIMITER_CANDIDATES)[number] = ','
  let bestScore = 0
  for (const delimiter of DELIMITER_CANDIDATES) {
    let min = Number.POSITIVE_INFINITY
    for (const line of lines) {
      min = Math.min(min, countOutsideQuotes(line, delimiter))
    }
    if (Number.isFinite(min) && min > bestScore) {
      best = delimiter
      bestScore = min
    }
  }
  return best
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes) {
        if (line[i + 1] === '"') {
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        inQuotes = true
      }
    } else if (!inQuotes && ch === delimiter) {
      count += 1
    }
  }
  return count
}

export function detectNewline(text: string): NewlineStyle {
  const lf = text.indexOf('\n')
  const cr = text.indexOf('\r')
  if (cr === -1) return '\n'
  if (lf === -1 || lf > cr) return cr + 1 === lf ? '\r\n' : '\r'
  return '\n'
}

/** Convert a character offset into a 1-based { line, column } position. */
export function locateOffset(text: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, text.length))
  let line = 1
  let column = 1
  for (let i = 0; i < clamped; i += 1) {
    const ch = text[i]
    if (ch === '\n') {
      line += 1
      column = 1
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') continue
      line += 1
      column = 1
    } else {
      column += 1
    }
  }
  return { line, column }
}

/**
 * Scan for an unterminated quoted field and return the position of its
 * opening quote. Mirrors papaparse's field semantics: a quote only opens a
 * quoted field at field start (after a delimiter or line break), `""` is an
 * escaped quote. Used to give strict-mode errors a precise line/column.
 */
export function findUnclosedQuote(text: string): { line: number; column: number } | null {
  let inQuotes = false
  let fieldStart = true
  let openOffset = -1
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes) {
        if (text[i + 1] === '"') {
          i += 1
        } else {
          inQuotes = false
          fieldStart = false
        }
      } else if (fieldStart) {
        inQuotes = true
        openOffset = i
        fieldStart = false
      }
      continue
    }
    if (inQuotes) continue
    if (ch === ',' || ch === ';' || ch === '\t' || ch === '|' || ch === '\n' || ch === '\r') {
      fieldStart = true
    } else {
      fieldStart = false
    }
  }
  return inQuotes ? locateOffset(text, openOffset) : null
}

/* ------------------------------------------------------------------ *
 * papaparse loading (dynamic import, first use only)
 * ------------------------------------------------------------------ */

interface PapaErrorLike {
  type?: string
  code?: string
  message?: string
  row?: number
  index?: number
}

interface PapaResultLike {
  data: unknown[][]
  errors: PapaErrorLike[]
  meta?: { cursor?: number }
}

interface PapaParseConfig {
  delimiter: string
  skipEmptyLines: boolean
  dynamicTyping: false
  chunkSize?: number
  chunk?: (results: PapaResultLike, parser: { resume: () => void }) => void
  complete?: (results: PapaResultLike) => void
  error?: (error: unknown) => void
}

interface PapaStatic {
  parse(text: string, config: PapaParseConfig): PapaResultLike
  unparse(rows: unknown[][], config?: { delimiter?: string; newline?: string }): string
}

async function loadPapa(): Promise<PapaStatic> {
  const Papa = (await import('papaparse')).default
  return Papa as unknown as PapaStatic
}

/* ------------------------------------------------------------------ *
 * CSV → JSON
 * ------------------------------------------------------------------ */

export async function csvToJson(
  text: string,
  options: CsvToJsonOptions = {},
): Promise<CsvToJsonOutcome> {
  const input = stripBom(text)
  if (input.trim() === '') {
    return { ok: false, errors: [{ code: 'empty' }] }
  }

  const Papa = await loadPapa()
  const delimiter = options.delimiter === 'auto' || options.delimiter === undefined
    ? detectDelimiter(input)
    : options.delimiter
  const result = Papa.parse(input, {
    delimiter,
    skipEmptyLines: true,
    dynamicTyping: false,
  })

  return finalizeCsvRows(input, result.data, result.errors, options.header ?? true)
}

/**
 * Streaming variant used by the worker for large file imports: parses in
 * chunks, reports progress (processed bytes) and accumulates rows/errors.
 */
export async function csvToJsonStreaming(
  text: string,
  options: CsvToJsonOptions = {},
  onProgress?: (bytes: number, total: number) => void,
): Promise<CsvToJsonOutcome> {
  const input = stripBom(text)
  if (input.trim() === '') {
    return { ok: false, errors: [{ code: 'empty' }] }
  }

  const Papa = await loadPapa()
  const delimiter = options.delimiter === 'auto' || options.delimiter === undefined
    ? detectDelimiter(input)
    : options.delimiter

  const rows: unknown[][] = []
  const errors: PapaErrorLike[] = []
  await new Promise<void>((resolve) => {
    Papa.parse(input, {
      delimiter,
      skipEmptyLines: true,
      dynamicTyping: false,
      chunkSize: options.chunkSize ?? STREAM_CHUNK_SIZE,
      chunk: (results, parser) => {
        rows.push(...results.data)
        errors.push(...results.errors)
        onProgress?.(results.meta?.cursor ?? 0, input.length)
        parser.resume()
      },
      complete: () => resolve(),
      error: (caught) => {
        errors.push({ message: caught instanceof Error ? caught.message : String(caught) })
        resolve()
      },
    })
  })

  return finalizeCsvRows(input, rows, errors, options.header ?? true)
}

function finalizeCsvRows(
  input: string,
  rawRows: unknown[][],
  papaparseErrors: PapaErrorLike[],
  header: boolean,
): CsvToJsonOutcome {
  const quoteError = findUnclosedQuote(input)
  if (quoteError) {
    return { ok: false, errors: [{ code: 'unclosedQuote', ...quoteError }] }
  }

  if (papaparseErrors.length > 0) {
    const located = papaparseErrors
      .slice(0, MAX_REPORTED_ERRORS)
      .map((error) => mapPapaparseError(input, error))
    return { ok: false, errors: located }
  }

  const rows = rawRows.map((row) => row.map((cell) => (typeof cell === 'string' ? cell : '')))
  const records = header ? rowsToRecords(rows) : rows
  return { ok: true, json: JSON.stringify(records, null, 2) }
}

function rowsToRecords(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return []
  const [head, ...body] = rows
  return body.map((row) => {
    const record: Record<string, string> = {}
    head.forEach((key, index) => {
      record[key] = row[index] ?? ''
    })
    return record
  })
}

function mapPapaparseError(input: string, error: PapaErrorLike): CsvJsonError {
  const isQuoteError = error.type === 'Quotes'
  const base: CsvJsonError = {
    code: isQuoteError ? 'unclosedQuote' : 'csvParse',
    message: error.message,
  }
  if (typeof error.index === 'number') {
    return { ...base, ...locateOffset(input, error.index) }
  }
  if (typeof error.row === 'number') {
    return { ...base, line: error.row + 1 }
  }
  return base
}

/* ------------------------------------------------------------------ *
 * JSON → CSV
 * ------------------------------------------------------------------ */

export async function jsonToCsv(
  text: string,
  options: JsonToCsvOptions = {},
): Promise<JsonToCsvOutcome> {
  if (text.trim() === '') {
    return { ok: false, errors: [{ code: 'empty' }] }
  }

  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (caught) {
    return { ok: false, errors: [jsonParseError(text, caught)] }
  }

  if (!Array.isArray(value)) {
    return { ok: false, errors: [{ code: 'notArray' }] }
  }

  const built = buildGrid(value)
  if (built.errors.length > 0) {
    return { ok: false, errors: built.errors }
  }
  if (built.columns === 0) {
    return { ok: true, csv: '' }
  }

  const Papa = await loadPapa()
  const newline = options.newline ?? '\r\n'
  const grid = built.header ? [built.header, ...built.rows] : built.rows
  let csv = Papa.unparse(grid, { delimiter: options.delimiter ?? ',', newline })
  if (options.ensureTrailingNewline && csv.length > 0) {
    csv += newline
  }
  return { ok: true, csv }
}

function jsonParseError(input: string, caught: unknown): CsvJsonError {
  const message = caught instanceof Error ? caught.message : 'Invalid JSON'
  const match = message.match(/line\s+(\d+)\D+column\s+(\d+)|position\s+(\d+)/i)
  if (!match) {
    return { code: 'jsonParse', message }
  }
  if (match[1] !== undefined && match[2] !== undefined) {
    return { code: 'jsonParse', message, line: Number(match[1]), column: Number(match[2]) }
  }
  const offset = Number(match[3])
  return { code: 'jsonParse', message, ...locateOffset(input, offset) }
}

type GridBuild =
  | { columns: 0; header: undefined; rows: []; errors: [] }
  | { columns: number; header?: string[]; rows: string[][]; errors: CsvJsonError[] }

function buildGrid(items: unknown[]): GridBuild {
  const first = items.find((item) => item !== undefined)
  const recordForm = first === undefined ? true : isPlainObject(first)
  const errors: CsvJsonError[] = []

  const union: string[] = []
  const seenKeys = new Set<string>()
  const rows: string[][] = []
  let columns = 0

  items.forEach((item, itemIndex) => {
    const row = itemIndex + 1
    if (recordForm) {
      if (!isPlainObject(item)) {
        errors.push({ code: 'invalidRow', row })
        return
      }
      for (const key of Object.keys(item)) {
        if (!seenKeys.has(key)) {
          seenKeys.add(key)
          union.push(key)
        }
      }
      columns = Math.max(columns, union.length)
    } else {
      if (!Array.isArray(item)) {
        errors.push({ code: 'invalidRow', row })
        return
      }
      columns = Math.max(columns, item.length)
    }
  })

  if (recordForm) {
    items.forEach((item, itemIndex) => {
      if (!isPlainObject(item)) return
      const row = itemIndex + 1
      for (const key of Object.keys(item)) {
        const cell = (item as Record<string, unknown>)[key]
        if (isNested(cell)) {
          errors.push({ code: 'nestedValue', key, row })
        }
      }
    })
  }

  items.forEach((item, itemIndex) => {
    if (recordForm) {
      if (!isPlainObject(item)) return
      const record = item as Record<string, unknown>
      rows.push(union.map((key) => stringifyCell(record[key])))
    } else if (Array.isArray(item)) {
      const cells: string[] = []
      item.forEach((cell, colIndex) => {
        if (isNested(cell)) {
          errors.push({ code: 'nestedValue', key: String(colIndex + 1), row: itemIndex + 1 })
          cells.push('')
        } else {
          cells.push(stringifyCell(cell))
        }
      })
      while (cells.length < columns) cells.push('')
      rows.push(cells)
    }
  })

  if (errors.length > MAX_REPORTED_ERRORS) errors.length = MAX_REPORTED_ERRORS

  if (columns === 0) {
    return { columns: 0, header: undefined, rows: [], errors: [] }
  }
  return {
    columns,
    header: recordForm ? union : undefined,
    rows,
    errors,
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNested(value: unknown): boolean {
  return value !== null && typeof value === 'object'
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  return String(value)
}
