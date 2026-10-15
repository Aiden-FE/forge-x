import type { Provider } from '@/types/provider'
import { buildChatCompletionsUrl } from '@/lib/providers'
import { redactSensitiveText } from '@/lib/providerCheck'

export type AiClientErrorCode =
  | 'provider-invalid'
  | 'network'
  | 'auth'
  | 'quota'
  | 'model-missing'
  | 'timeout'
  | 'request'
  | 'response'

export class AiClientError extends Error {
  readonly code: AiClientErrorCode
  readonly status?: number

  constructor(code: AiClientErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'AiClientError'
    this.code = code
    this.status = status
  }
}

export interface ChatCompletionContent {
  systemPrompt: string
  userContent: string
}

/**
 * A provider can be used without choosing a model explicitly: the selected
 * default wins, otherwise the first configured model is the practical default.
 */
export function resolveDefaultModel(provider: Provider): string | null {
  return provider.defaultModelId ?? provider.models[0] ?? null
}

function statusToErrorCode(status: number): AiClientErrorCode {
  if (status === 401 || status === 403) return 'auth'
  if (status === 402 || status === 429) return 'quota'
  if (status === 404) return 'model-missing'
  if (status === 408 || status === 504) return 'timeout'
  return 'request'
}

/**
 * Send one non-streaming text-to-text request. Error messages are intentionally
 * generic: provider credentials and response bodies are never copied onto them.
 */
export async function sendChatCompletion(
  provider: Provider,
  content: ChatCompletionContent,
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
): Promise<string> {
  let url: string
  try {
    url = buildChatCompletionsUrl(provider.baseURL)
  } catch {
    throw new AiClientError('provider-invalid', 'Provider baseURL is not a valid HTTP(S) root address')
  }

  const model = resolveDefaultModel(provider)
  if (!model) {
    throw new AiClientError('provider-invalid', 'Provider has no usable default model')
  }

  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: 'system', content: content.systemPrompt },
          { role: 'user', content: content.userContent },
        ],
      }),
    })
  } catch {
    throw new AiClientError('network', 'Unable to connect to the provider')
  }

  if (!response.ok) {
    // Consume the body without retaining it; diagnostics belong to ticket 05.
    await response.arrayBuffer().catch(() => undefined)
    throw new AiClientError(statusToErrorCode(response.status), 'Provider request failed', response.status)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new AiClientError('response', 'Provider returned an invalid response')
  }

  const choices = (payload as { choices?: unknown }).choices
  const firstChoice = Array.isArray(choices) ? choices[0] : undefined
  const message = (firstChoice as { message?: unknown } | undefined)?.message
  const text = (message as { content?: unknown } | undefined)?.content

  if (typeof text !== 'string' || !text.trim()) {
    throw new AiClientError('response', 'Provider did not return text content')
  }
  return text
}

/**
 * Run the same OpenAI-compatible request with an explicit model selected in a
 * tool session. A null or undefined model preserves the store default.
 */
export async function sendChatCompletionWithModel(
  provider: Provider,
  content: ChatCompletionContent,
  modelId: string | null | undefined,
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
): Promise<string> {
  if (modelId === null || modelId === undefined) {
    return sendChatCompletion(provider, content, fetchImpl)
  }

  const normalizedModelId = modelId.trim()
  if (!normalizedModelId || !provider.models.includes(normalizedModelId)) {
    throw new AiClientError('provider-invalid', 'The selected model is not available for this provider')
  }

  return sendChatCompletion(
    { ...provider, defaultModelId: normalizedModelId },
    content,
    fetchImpl,
  )
}

export interface AiClientRequestDiagnostics {
  endpoint: string | null
  status?: number
  responseSummary?: string
}

/**
 * Extends, without replacing, the stable `AiClientError` contract with the
 * sanitized diagnostic fields required by inline runtime error cards.
 */
export class AiClientRequestError extends AiClientError {
  readonly endpoint: string | null
  readonly responseSummary?: string

  constructor(
    code: AiClientErrorCode,
    message: string,
    diagnostics: AiClientRequestDiagnostics,
  ) {
    super(code, message, diagnostics.status)
    this.name = 'AiClientRequestError'
    this.endpoint = diagnostics.endpoint
    this.responseSummary = diagnostics.responseSummary
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this.status,
      endpoint: this.endpoint,
      responseSummary: this.responseSummary,
    }
  }
}

export interface ChatCompletionRuntimeOptions {
  signal?: AbortSignal
}

const RESPONSE_SUMMARY_LIMIT = 512

function sanitizeResponseSummary(
  responseSummary: string,
  provider: Provider,
  userContent: string,
): string {
  return redactSensitiveText(responseSummary, {
    secrets: [provider.apiKey, userContent],
  })
}

async function parseRuntimeSuccess(response: Response): Promise<string> {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new AiClientError('response', 'Provider returned an invalid response')
  }

  const choices = (payload as { choices?: unknown }).choices
  const firstChoice = Array.isArray(choices) ? choices[0] : undefined
  const message = (firstChoice as { message?: unknown } | undefined)?.message
  const text = (message as { content?: unknown } | undefined)?.content

  if (typeof text !== 'string' || !text.trim()) {
    throw new AiClientError('response', 'Provider did not return text content')
  }
  return text
}

/**
 * Runtime variant used by tool UIs. Existing exports keep their previous
 * behavior; this function additionally retains a bounded, sanitized response
 * fragment for diagnostics and propagates cancellation through `fetch`.
 */
export async function sendChatCompletionWithRuntimeDiagnostics(
  provider: Provider,
  content: ChatCompletionContent,
  modelId: string | null | undefined,
  options: ChatCompletionRuntimeOptions = {},
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
): Promise<string> {
  options.signal?.throwIfAborted()

  let endpoint: string | null = null
  try {
    endpoint = buildChatCompletionsUrl(provider.baseURL)
  } catch {
    throw new AiClientRequestError(
      'provider-invalid',
      'Provider baseURL is not a valid HTTP(S) root address',
      { endpoint: null },
    )
  }

  let effectiveProvider = provider
  if (modelId !== null && modelId !== undefined) {
    const normalizedModelId = modelId.trim()
    if (!normalizedModelId || !provider.models.includes(normalizedModelId)) {
      throw new AiClientRequestError(
        'provider-invalid',
        'The selected model is not available for this provider',
        { endpoint },
      )
    }
    effectiveProvider = { ...provider, defaultModelId: normalizedModelId }
  }

  const model = resolveDefaultModel(effectiveProvider)
  if (!model) {
    throw new AiClientRequestError(
      'provider-invalid',
      'Provider has no usable default model',
      { endpoint },
    )
  }

  let response: Response
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${effectiveProvider.apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: 'system', content: content.systemPrompt },
          { role: 'user', content: content.userContent },
        ],
      }),
      signal: options.signal,
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    const isTimeout = error instanceof Error
      && (error.name === 'TimeoutError' || error.name === 'AbortError')
    throw new AiClientRequestError(
      isTimeout ? 'timeout' : 'network',
      isTimeout ? 'Provider request timed out' : 'Unable to connect to the provider',
      {
        endpoint,
        responseSummary: sanitizeResponseSummary(
          error instanceof Error ? error.message : '',
          provider,
          content.userContent,
        ),
      },
    )
  }

  if (!response.ok) {
    const rawResponseSummary = await response.text().catch(() => '')
    throw new AiClientRequestError(
      statusToErrorCode(response.status),
      'Provider request failed',
      {
        endpoint,
        status: response.status,
        responseSummary: sanitizeResponseSummary(
          rawResponseSummary.slice(0, RESPONSE_SUMMARY_LIMIT),
          provider,
          content.userContent,
        ),
      },
    )
  }

  options.signal?.throwIfAborted()
  return parseRuntimeSuccess(response)
}
