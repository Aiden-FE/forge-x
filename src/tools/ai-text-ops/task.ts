import type { Provider } from '@/types/provider'
import {
  AiClientError,
  AiClientRequestError,
  sendChatCompletionWithRuntimeDiagnostics,
  sendChatCompletionWithModel,
  type AiClientErrorCode,
} from '@/lib/aiClient'
import type { AiRuntimeError } from './runtime'

export const TRANSLATION_SYSTEM_PROMPT = [
  'You are a translation assistant.',
  'If the input is primarily in Chinese, translate it into natural English.',
  'Otherwise, translate it into natural Simplified Chinese.',
  'Return only the translation, without quotations or explanations.',
].join(' ')

export const POLISH_SYSTEM_PROMPT = [
  'You are a writing editor.',
  'Improve clarity, grammar, flow, and concision while preserving the meaning, language, tone, and formatting of the input.',
  'Return only the polished text, without quotations or explanations.',
].join(' ')

export const SUMMARIZE_SYSTEM_PROMPT = [
  'You are a summarization assistant.',
  'Write a concise summary that captures the key points of the input.',
  'Respond in the same language as the input.',
  'Return only the summary, without quotations or explanations.',
].join(' ')

export const TONE_SYSTEM_PROMPT = [
  'You are a tone editor.',
  'Adjust the tone to be professional and approachable while preserving the meaning and language of the input.',
  'Return only the adjusted text, without quotations or explanations.',
].join(' ')

export const EXPLAIN_SYSTEM_PROMPT = [
  'You are an explanation assistant.',
  'Explain the input simply and clearly for a general audience.',
  'Respond in the same language as the input.',
  'Return only the explanation, without quotations or explanations.',
].join(' ')

export const AI_TEXT_TASKS = ['translate', 'polish', 'summarize', 'tone', 'explain'] as const

export type AiTextTaskId = (typeof AI_TEXT_TASKS)[number]

export const AI_TEXT_TASK_SYSTEM_PROMPTS: Record<AiTextTaskId, string> = {
  translate: TRANSLATION_SYSTEM_PROMPT,
  polish: POLISH_SYSTEM_PROMPT,
  summarize: SUMMARIZE_SYSTEM_PROMPT,
  tone: TONE_SYSTEM_PROMPT,
  explain: EXPLAIN_SYSTEM_PROMPT,
}

export function getAiTextTaskSystemPrompt(taskId: AiTextTaskId): string {
  return AI_TEXT_TASK_SYSTEM_PROMPTS[taskId]
}

export type AiTextTaskResult =
  | { kind: 'success'; input: string; output: string }
  | { kind: 'needs-provider'; input: string }
  | { kind: 'empty-input'; input: string }
  | { kind: 'cancelled'; input: string }
  | {
      kind: 'failure'
      input: string
      errorCode: AiClientErrorCode
      error: AiRuntimeError
    }

type LegacyAiTextTaskResult =
  | Extract<AiTextTaskResult, { kind: 'success' | 'needs-provider' | 'empty-input' }>
  | { kind: 'failure'; input: string; errorCode: AiClientErrorCode }

export interface AiTextTaskOptions {
  modelId?: string | null
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

function toRuntimeError(error: unknown): AiRuntimeError {
  const errorCode = error instanceof AiClientError ? error.code : 'request'
  return {
    code: errorCode,
    status: error instanceof AiClientError ? error.status : undefined,
    endpoint: error instanceof AiClientRequestError ? error.endpoint : undefined,
    responseSummary: error instanceof AiClientRequestError ? error.responseSummary : undefined,
  }
}

export async function runAiTextTask(
  provider: Provider | null,
  taskId: AiTextTaskId,
  input: string,
  options: AiTextTaskOptions = {},
): Promise<AiTextTaskResult> {
  if (!provider) return { kind: 'needs-provider', input }
  if (!input.trim()) return { kind: 'empty-input', input }

  const signal = options.signal
  const request = (async (): Promise<AiTextTaskResult> => {
    try {
      const output = await sendChatCompletionWithRuntimeDiagnostics(
        provider,
        {
          systemPrompt: getAiTextTaskSystemPrompt(taskId),
          userContent: input,
        },
        options.modelId,
        { signal },
        options.fetchImpl,
      )
      return { kind: 'success', input, output }
    } catch (error) {
      const errorCode = error instanceof AiClientError ? error.code : 'request'
      return {
        kind: 'failure',
        input,
        errorCode,
        error: toRuntimeError(error),
      }
    }
  })()

  const cancellation = new Promise<'cancelled'>((resolve) => {
    if (signal?.aborted) {
      resolve('cancelled')
      return
    }
    signal?.addEventListener('abort', () => resolve('cancelled'), { once: true })
  })
  const outcome = await Promise.race([request, cancellation])

  if (signal?.aborted) {
    return { kind: 'cancelled', input }
  }

  if (outcome === 'cancelled') {
    return { kind: 'cancelled', input }
  }

  return outcome
}

export async function runTranslationTask(
  provider: Provider | null,
  input: string,
  fetchImpl?: typeof fetch,
): Promise<AiTextTaskResult> {
  return runAiTextTask(provider, 'translate', input, { fetchImpl })
}

/**
 * Backward-compatible wrapper for callers that still use the pre-diagnostics
 * client. It preserves the original error-code-only result behavior.
 */
export async function runAiTextTaskWithLegacyClient(
  provider: Provider | null,
  taskId: AiTextTaskId,
  input: string,
  options: Pick<AiTextTaskOptions, 'modelId' | 'fetchImpl'> = {},
): Promise<
  LegacyAiTextTaskResult
> {
  try {
    if (!provider) return { kind: 'needs-provider', input }
    const output = await sendChatCompletionWithModel(
      provider,
      {
        systemPrompt: getAiTextTaskSystemPrompt(taskId),
        userContent: input,
      },
      options.modelId,
      options.fetchImpl,
    )
    return { kind: 'success', input, output }
  } catch (error) {
    const errorCode = error instanceof AiClientError ? error.code : 'request'
    return { kind: 'failure', input, errorCode }
  }
}
