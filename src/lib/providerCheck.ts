import { buildChatCompletionsUrl, normalizeProviderBaseUrl } from '@/lib/providers'
import type { Provider } from '@/types/provider'

export const MODEL_LIST_PATH = '/v1/models'

export type ProviderCheckStatus =
  | 'success'
  | 'network'
  | 'auth'
  | 'modelNotFound'

export type ProviderCheckErrorKind = Exclude<ProviderCheckStatus, 'success'>

/**
 * Runtime failures use the shared connectivity categories and add quota and
 * timeout, which are meaningful for generation calls but not for model listing.
 */
export type ProviderRuntimeStatus =
  | ProviderCheckStatus
  | 'quota'
  | 'timeout'
  | 'model-missing'
  | 'request'

export interface ProviderCheckResult {
  status: ProviderCheckStatus
}

export interface ProviderCheckErrorOptions {
  status?: number
}

/**
 * A checked fetch/HTTP failure with a stable classification. The `success`
 * value exists in the shared status union for UI and tests; it is never thrown.
 */
export class ProviderCheckError extends Error {
  readonly kind: ProviderCheckStatus
  readonly status?: number

  constructor(kind: ProviderCheckStatus, message: string, options: ProviderCheckErrorOptions = {}) {
    super(message)
    this.name = 'ProviderCheckError'
    this.kind = kind
    this.status = options.status
  }
}

export function buildModelsUrl(baseURL: string): string {
  const normalizedBaseURL = normalizeProviderBaseUrl(baseURL)
  if (!normalizedBaseURL) {
    throw new TypeError('Provider baseURL must be a valid HTTP(S) root address')
  }
  return `${normalizedBaseURL}${MODEL_LIST_PATH}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isProviderCheckStatus(value: unknown): value is ProviderCheckStatus {
  return value === 'success'
    || value === 'network'
    || value === 'auth'
    || value === 'modelNotFound'
}

function authHeader(apiKey: string): Record<string, string> {
  const normalizedApiKey = apiKey.trim()
  return normalizedApiKey ? { Authorization: `Bearer ${normalizedApiKey}` } : {}
}

function httpCheckError(response: Response): ProviderCheckError {
  if (response.status === 401 || response.status === 403) {
    return new ProviderCheckError('auth', `Provider authentication failed (${response.status})`, {
      status: response.status,
    })
  }

  if (response.status === 404) {
    return new ProviderCheckError(
      'modelNotFound',
      'The selected provider model was not found (404)',
      { status: response.status },
    )
  }

  return new ProviderCheckError('network', `Provider request failed (${response.status})`, {
    status: response.status,
  })
}

function requestHeaders(provider: Provider): Record<string, string> {
  return {
    ...authHeader(provider.apiKey),
  }
}

/**
 * Check the models endpoint. It does not generate tokens and verifies only
 * that the provider is reachable and the API key is accepted.
 */
export async function quickCheck(provider: Provider): Promise<ProviderCheckResult> {
  const response = await globalThis.fetch(buildModelsUrl(provider.baseURL), {
    method: 'GET',
    headers: requestHeaders(provider),
  })

  if (!response.ok) {
    throw httpCheckError(response)
  }

  return { status: 'success' }
}

async function readCompletionBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new ProviderCheckError('network', 'The provider returned an unreadable completion response')
  }
}

/**
 * Check that one selected model can complete a generation. `max_tokens` is
 * kept at its minimum so the request verifies the model without extra cost.
 */
export async function deepCheck(provider: Provider, model: string): Promise<ProviderCheckResult> {
  const selectedModel = model.trim()
  if (!selectedModel) {
    throw new ProviderCheckError('modelNotFound', 'A model must be selected for a deep check')
  }

  const response = await globalThis.fetch(buildChatCompletionsUrl(provider.baseURL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(provider.apiKey),
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
      stream: false,
    }),
  })

  if (!response.ok) {
    throw httpCheckError(response)
  }

  const body = await readCompletionBody(response)
  if (!isRecord(body) || !Array.isArray(body.choices)) {
    throw new ProviderCheckError('network', 'The provider returned an invalid completion response')
  }

  return { status: 'success' }
}

/**
 * Map any thrown check failure to one shared four-value classification.
 * Unknown failures are treated as network failures because they prevented a
 * validated response from being returned.
 */
export function classifyCheckError(error: unknown): ProviderCheckStatus {
  if (error instanceof ProviderCheckError) {
    return error.kind
  }

  if (isRecord(error) && isProviderCheckStatus(error.kind)) {
    return error.kind
  }

  if (isRecord(error) && typeof error.status === 'number') {
    if (error.status === 401 || error.status === 403) return 'auth'
    if (error.status === 404) return 'modelNotFound'
    return 'network'
  }

  if (
    error instanceof Error
    && (error.name === 'AbortError' || error.name === 'TimeoutError')
  ) {
    return 'network'
  }

  if (error instanceof TypeError) {
    return 'network'
  }

  return 'network'
}

export interface RedactSensitiveTextOptions {
  /** Exact provider-owned values that must never survive diagnostics. */
  secrets?: readonly string[]
}

const SK_LIKE_TOKEN_PATTERN = /sk-[A-Za-z0-9_-]{8,}/g
const LONG_TOKEN_PATTERN = /(?<![\w.~-])(?=[A-Za-z0-9._~-]{24,})(?=[A-Za-z0-9._~-]*\d)(?=[A-Za-z0-9._~-]*[A-Za-z])[A-Za-z0-9._~-]{24,}(?![\w.~-])/g

/**
 * Remove credential-shaped data before a response fragment is retained by UI.
 * Exact provider keys are removed first so even non-standard key formats are
 * covered; generic patterns cover values echoed back by a provider.
 */
export function redactSensitiveText(
  input: string,
  options: RedactSensitiveTextOptions = {},
): string {
  let output = input

  for (const secret of options.secrets ?? []) {
    if (!secret || secret.length < 4) continue
    const escapedSecret = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    output = output.replace(new RegExp(escapedSecret, 'g'), '[redacted]')
  }

  return output
    .replace(SK_LIKE_TOKEN_PATTERN, 'sk-[redacted]')
    .replace(LONG_TOKEN_PATTERN, '[redacted]')
}

/**
 * Share the connectivity semantics with runtime generation errors while
 * retaining the legacy four-value behavior of `classifyCheckError`.
 */
export function classifyRuntimeError(error: unknown): ProviderRuntimeStatus {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return 'timeout'
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      kind?: unknown
      code?: unknown
      status?: unknown
    }

    if (candidate.kind === 'modelNotFound') return 'model-missing'
    if (candidate.kind === 'network' || candidate.kind === 'auth') return candidate.kind

    if (
      candidate.code === 'network'
      || candidate.code === 'auth'
      || candidate.code === 'quota'
      || candidate.code === 'model-missing'
      || candidate.code === 'timeout'
    ) {
      return candidate.code
    }

    if (typeof candidate.status === 'number') {
      if (candidate.status === 401 || candidate.status === 403) return 'auth'
      if (candidate.status === 402 || candidate.status === 429) return 'quota'
      if (candidate.status === 404) return 'model-missing'
      if (candidate.status === 408 || candidate.status === 504) return 'timeout'
    }
  }

  if (error instanceof TypeError) return 'network'
  return 'request'
}
