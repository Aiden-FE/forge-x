import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Provider } from '@/types/provider'
import { AiClientError, resolveDefaultModel, sendChatCompletion } from './aiClient'

function createProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'provider-1',
    name: 'Example',
    baseURL: 'https://api.example.com/',
    apiKey: 'secret-key-do-not-leak',
    models: ['fallback-model', 'other-model'],
    enabled: true,
    defaultModelId: null,
    ...overrides,
  }
}

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('aiClient 请求构造', () => {
  it('固定拼接 chat completions 路径，并使用显式默认模型发送非流式请求', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => createJsonResponse({
      choices: [{ message: { content: 'Translated text' } }],
    }))
    const provider = createProvider({
      baseURL: 'https://api.example.com',
      defaultModelId: 'preferred-model',
    })

    const output = await sendChatCompletion(provider, {
      systemPrompt: 'system',
      userContent: 'hello',
    }, fetchImpl)

    expect(output).toBe('Translated text')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    )
    const request = fetchImpl.mock.calls[0]![1]!
    expect(request.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer secret-key-do-not-leak',
    })
    expect(JSON.parse(request.body as string)).toEqual({
      model: 'preferred-model',
      stream: false,
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'hello' },
      ],
    })
  })

  it('未标记默认模型时选择首个模型', () => {
    const provider = createProvider({ defaultModelId: null })
    expect(resolveDefaultModel(provider)).toBe('fallback-model')
  })

  it('缺少模型或 BaseURL 无效时抛出语义错误', async () => {
    const fetchImpl = vi.fn()
    await expect(sendChatCompletion(
      createProvider({ models: [], defaultModelId: null }),
      { systemPrompt: 'system', userContent: 'hello' },
      fetchImpl,
    )).rejects.toMatchObject({ code: 'provider-invalid' })

    await expect(sendChatCompletion(
      createProvider({ baseURL: 'https://api.example.com/v1' }),
      { systemPrompt: 'system', userContent: 'hello' },
      fetchImpl,
    )).rejects.toBeInstanceOf(AiClientError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('请求失败时错误对象和文本形式都不包含 API Key', async () => {
    const fetchImpl = vi.fn(async () => new Response('denied', { status: 401 }))
    let error: unknown
    try {
      await sendChatCompletion(createProvider(), {
        systemPrompt: 'system',
        userContent: 'hello',
      }, fetchImpl)
    } catch (caught) {
      error = caught
    }

    expect(error).toMatchObject({ code: 'auth', status: 401 })
    const errorText = `${String(error)} ${JSON.stringify(error)}`
    expect(errorText).not.toContain('secret-key-do-not-leak')
  })
})
