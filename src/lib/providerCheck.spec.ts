import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Provider } from '@/types/provider'
import {
  buildModelsUrl,
  classifyCheckError,
  deepCheck,
  quickCheck,
} from './providerCheck'

const provider: Provider = {
  id: 'provider-1',
  name: 'Example',
  baseURL: 'https://api.example.com',
  apiKey: 'secret-key',
  models: ['model-a'],
  enabled: true,
  defaultModelId: 'model-a',
}

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status })
}

async function resultFromCheck(check: Promise<unknown>) {
  try {
    return await check
  } catch (error) {
    return { status: classifyCheckError(error) }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('provider model URL', () => {
  it('固定拼接根地址下的 models 端点', () => {
    expect(buildModelsUrl('https://api.example.com')).toBe('https://api.example.com/v1/models')
    expect(buildModelsUrl('http://localhost:11434/')).toBe('http://localhost:11434/v1/models')
  })

  it('拒绝非根地址的 BaseURL', () => {
    expect(() => buildModelsUrl('https://api.example.com/v1')).toThrow(TypeError)
  })
})

describe('provider quick check', () => {
  it('用 GET 请求 models 端点并携带鉴权，成功时不发送生成请求', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { object: 'list' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(quickCheck(provider)).resolves.toEqual({ status: 'success' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer secret-key' },
      }),
    )
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.body).toBeUndefined()
  })

  it('把 401 响应归类为鉴权失败', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401)))

    await expect(resultFromCheck(quickCheck(provider))).resolves.toEqual({ status: 'auth' })
  })

  it('把 DNS 或网络错误归类为网络失败', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

    await expect(resultFromCheck(quickCheck(provider))).resolves.toEqual({ status: 'network' })
  })
})

describe('provider deep check', () => {
  it('用所选模型发送最小生成请求，并在成功响应后归类为成功', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {
      object: 'chat.completion',
      choices: [{ message: { role: 'assistant', content: 'ok' } }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(deepCheck(provider, 'model-a')).resolves.toEqual({ status: 'success' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-key',
        },
      }),
    )
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'model-a',
      max_tokens: 1,
      stream: false,
    })
  })

  it('把 404 响应归类为模型不存在', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404)))

    await expect(resultFromCheck(deepCheck(provider, 'missing-model')))
      .resolves
      .toEqual({ status: 'modelNotFound' })
  })
})

describe('provider check classifier', () => {
  it('导出四类稳定结果', () => {
    expect(classifyCheckError({ kind: 'success' })).toBe('success')
    expect(classifyCheckError(new TypeError('Failed to fetch'))).toBe('network')
    expect(classifyCheckError({ kind: 'auth' })).toBe('auth')
    expect(classifyCheckError({ kind: 'modelNotFound' })).toBe('modelNotFound')
  })
})
