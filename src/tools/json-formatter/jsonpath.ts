/**
 * JSONPath query logic for the JSON formatter (pure, UI-free).
 *
 * The query engine is jsonpath-plus, loaded lazily via dynamic import on
 * first use (platform rule: it must never enter the entry bundle; the
 * module reference is cached after the first load). Goessner full syntax
 * is delegated to the library: dot/bracket notation, `*`, `..` recursive
 * descent, unions, slices (incl. step), filter `[?(...)]` and script
 * `[(...)]` expressions.
 *
 * Eval policy: `eval: 'safe'` (the library default) is passed explicitly —
 * filter/script expressions are required by the spec, so `eval: false`
 * (which throws on any `?(...)`) is not an option; `'safe'` keeps script
 * evaluation inside a sandbox (vm.runInNewContext on Node, a closure-scoped
 * Function in the browser) instead of native global eval.
 *
 * All functions are async and return result objects instead of throwing so
 * the UI can render one structured, localized error:
 * - `empty`      — the JSON input is blank
 * - `jsonParse`  — the document is not valid JSON (checked before querying)
 * - `invalidPath`— the path/filter expression fails to parse
 * - `queryError` — the path parses but evaluation fails at runtime
 * An empty match set is a successful outcome with `matches: []`, never an
 * error.
 */
import type { JSONPathOptions, ReturnObject } from 'jsonpath-plus'

export type JsonPathErrorCode = 'empty' | 'jsonParse' | 'invalidPath' | 'queryError'

export interface JsonPathError {
  code: JsonPathErrorCode
  /** Underlying engine message, kept for all failure kinds. */
  message?: string
}

export interface JsonPathMatch {
  /** Normalized absolute path of the match, e.g. `$['store']['book'][0]`. */
  path: string
  value: unknown
}

export type JsonPathQueryOutcome =
  | { ok: true; matches: JsonPathMatch[] }
  | { ok: false; error: JsonPathError }

type JsonPathPlusModule = typeof import('jsonpath-plus')

let modulePromise: Promise<JsonPathPlusModule> | null = null

/**
 * Lazy-load jsonpath-plus on first use (platform rule: the library must
 * never enter the entry bundle). The module promise is cached so repeated
 * queries reuse the same module reference.
 */
function loadJsonPathPlus(): Promise<JsonPathPlusModule> {
  modulePromise ??= import('jsonpath-plus')
  return modulePromise
}

export async function queryJsonPath(jsonText: string, path: string): Promise<JsonPathQueryOutcome> {
  if (jsonText.trim() === '') {
    return { ok: false, error: { code: 'empty' } }
  }

  let doc: unknown
  try {
    doc = JSON.parse(jsonText)
  } catch (caught) {
    return {
      ok: false,
      error: {
        code: 'jsonParse',
        message: caught instanceof Error ? caught.message : String(caught),
      },
    }
  }

  if (path.trim() === '') {
    return { ok: false, error: { code: 'invalidPath', message: 'Path is empty' } }
  }

  const { JSONPath } = await loadJsonPathPlus()

  const options: JSONPathOptions = {
    json: doc,
    path,
    resultType: 'all',
    wrap: true,
    eval: 'safe',
    ignoreEvalErrors: false,
  }

  let rows: unknown
  try {
    rows = JSONPath(options)
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    return { ok: false, error: { code: classifyError(message), message } }
  }

  if (!Array.isArray(rows)) {
    rows = [rows]
  }

  const matches = (rows as ReturnObject[]).map((row) => ({
    path: typeof row.path === 'string' ? row.path : JSONPath.toPathString(row.path as string[]),
    value: row.value,
  }))
  return { ok: true, matches }
}

/**
 * Tell a path-syntax failure from a runtime evaluation failure by the
 * engine's message shape: filter/script parse errors are anchored with
 * "… at character N", while evaluation failures are prefixed "jsonPath:"
 * (or are arbitrary engine/runtime errors) — both query-time failures.
 */
function classifyError(message: string): JsonPathErrorCode {
  if (/\bat character \d+\b/.test(message)) return 'invalidPath'
  return 'queryError'
}
