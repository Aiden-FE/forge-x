import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Provider } from '@/types/provider'
import { useProvidersStore } from '@/stores/providers'
import {
  AI_TEXT_TASKS,
  AI_TEXT_TASK_SYSTEM_PROMPTS,
  getAiTextTaskSystemPrompt,
  runAiTextTask,
  runTranslationTask,
} from './task'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

function createProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'provider-1',
    name: 'Example',
    baseURL: 'https://api.example.com',
    apiKey: 'secret-key',
    models: ['text-model'],
    enabled: true,
    defaultModelId: 'text-model',
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  setActivePinia(createPinia())
})

describe('AI 文本操作翻译任务', () => {
  it('未配置有效默认供应商时返回引导态，并保留输入', async () => {
    const store = useProvidersStore()
    expect(store.effectiveDefaultProvider).toBeNull()

    const result = await runTranslationTask(store.effectiveDefaultProvider, 'hello', vi.fn())
    expect(result).toEqual({ kind: 'needs-provider', input: 'hello' })
  })

  it('使用默认供应商和默认模型完成翻译，并保留输入', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: 'Hello' } }],
    }), { status: 200 }))
    const provider = createProvider()

    const result = await runTranslationTask(provider, '你好', fetchImpl)
    expect(result).toEqual({ kind: 'success', input: '你好', output: 'Hello' })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string).model).toBe('text-model')
  })

  it('失败结果携带语义错误类别并保留原输入', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }))
    const result = await runTranslationTask(createProvider(), '你好', fetchImpl)
    expect(result).toMatchObject({
      kind: 'failure',
      input: '你好',
      errorCode: 'auth',
      error: {
        code: 'auth',
        status: 401,
      },
    })
  })

  it('失败诊断包含状态码与端点，但不包含 API Key、sk token、长随机串或用户输入', async () => {
    const apiKey = 'secret-key-do-not-leak'
    const userText = 'secret-user-input'
    const provider = createProvider({ apiKey })
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({
        error: {
          message: `Denied for ${apiKey}, token sk-liveabcdefghijklmnopqrstuvwxyz, trace abc123def456ghijklmnopqrstuvwxyz, echoed ${userText}`,
        },
      }),
      { status: 401 },
    ))

    const result = await runAiTextTask(provider, 'translate', userText, { fetchImpl })
    if (result.kind !== 'failure') throw new Error('expected failure')

    expect(result.error).toMatchObject({
      code: 'auth',
      status: 401,
      endpoint: 'https://api.example.com/v1/chat/completions',
    })
    const diagnosticsText = JSON.stringify(result.error)
    expect(diagnosticsText).not.toContain(apiKey)
    expect(diagnosticsText).not.toContain('sk-liveabcdefghijklmnopqrstuvwxyz')
    expect(diagnosticsText).not.toContain('abc123def456ghijklmnopqrstuvwxyz')
    expect(diagnosticsText).not.toContain(userText)
  })

  it('请求 abort 后返回取消状态并保留原输入', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      }, { once: true })
    }))
    const request = runAiTextTask(createProvider(), 'translate', '保留输入', {
      signal: controller.signal,
      fetchImpl,
    })

    controller.abort()
    await expect(request).resolves.toEqual({ kind: 'cancelled', input: '保留输入' })
  })

  it('重试复用原始输入，两次请求的 user 内容一致', async () => {
    const provider = createProvider()
    const failingFetch = vi.fn(async () => new Response('', { status: 504 }))
    const firstResult = await runAiTextTask(provider, 'translate', 'original text', {
      fetchImpl: failingFetch,
    })
    expect(firstResult).toMatchObject({ kind: 'failure', input: 'original text' })

    const retryFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(init!.body as string).messages[1]).toEqual({
        role: 'user',
        content: 'original text',
      })
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'retried' } }],
      }), { status: 200 })
    })
    const retryResult = await runAiTextTask(provider, 'translate', firstResult.input, {
      fetchImpl: retryFetch,
    })

    expect(retryResult).toEqual({
      kind: 'success',
      input: 'original text',
      output: 'retried',
    })
    expect(failingFetch).toHaveBeenCalledTimes(1)
    expect(retryFetch).toHaveBeenCalledTimes(1)
  })
})

describe('AI 文本操作五任务 prompt 构造', () => {
  it('为五个任务分别构造各自 system prompt，并保留输入和输出', async () => {
    expect(AI_TEXT_TASKS).toEqual(['translate', 'polish', 'summarize', 'tone', 'explain'])

    for (const taskId of AI_TEXT_TASKS) {
      const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
        choices: [{ message: { content: `${taskId}-result` } }],
      }), { status: 200 }))

      const result = await runAiTextTask(createProvider(), taskId, 'shared input', {
        fetchImpl,
      })

      expect(getAiTextTaskSystemPrompt(taskId)).toBe(AI_TEXT_TASK_SYSTEM_PROMPTS[taskId])
      expect(result).toEqual({
        kind: 'success',
        input: 'shared input',
        output: `${taskId}-result`,
      })
      const request = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)
      expect(request.messages[0]).toEqual({
        role: 'system',
        content: AI_TEXT_TASK_SYSTEM_PROMPTS[taskId],
      })
      expect(request.messages[1]).toEqual({ role: 'user', content: 'shared input' })
    }
  })

  it('翻译任务沿用既有翻译 prompt，不引入新任务语义', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: 'Hello' } }],
    }), { status: 200 }))

    await runTranslationTask(createProvider(), '你好', fetchImpl)
    const request = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)
    expect(request.messages[0]?.content).toBe(AI_TEXT_TASK_SYSTEM_PROMPTS.translate)
  })

  it('下一次任务立即使用临时选择的模型，且拒绝不属于该供应商的模型', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: 'ok' } }],
    }), { status: 200 }))
    const provider = createProvider()

    const result = await runAiTextTask(provider, 'summarize', 'hello', {
      modelId: null,
      fetchImpl,
    })
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string).model).toBe('text-model')
    expect(result.kind).toBe('success')

    await expect(runAiTextTask(provider, 'polish', 'hello', {
      modelId: 'missing-model',
      fetchImpl,
    })).resolves.toMatchObject({ kind: 'failure', errorCode: 'provider-invalid' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
