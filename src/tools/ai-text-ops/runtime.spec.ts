import { describe, expect, it } from 'vitest'
import en from '@/locales/en'
import zhCN from '@/locales/zh-CN'
import { classifyRuntimeError, redactSensitiveText } from '@/lib/providerCheck'
import {
  aiRuntimeErrorMessageKey,
  hasRuntimeSelectionChanged,
  recoveryActionsFor,
} from './runtime'

describe('AI 运行时错误恢复矩阵', () => {
  it('把共享分类器扩展为运行时五类语义', () => {
    expect(classifyRuntimeError(new TypeError('Failed to fetch'))).toBe('network')
    expect(classifyRuntimeError({ status: 403 })).toBe('auth')
    expect(classifyRuntimeError({ status: 429 })).toBe('quota')
    expect(classifyRuntimeError({ status: 404 })).toBe('model-missing')
    expect(classifyRuntimeError(new DOMException('timeout', 'TimeoutError'))).toBe('timeout')
  })

  it('按已决议类别映射主动作和次动作', () => {
    expect(recoveryActionsFor('network')).toEqual(['retry', 'open-settings'])
    expect(recoveryActionsFor('auth')).toEqual(['open-settings'])
    expect(recoveryActionsFor('quota')).toEqual(['switch-selection', 'open-settings'])
    expect(recoveryActionsFor('model-missing')).toEqual([
      'open-settings',
      'switch-selection',
    ])
    expect(recoveryActionsFor('timeout')).toEqual(['retry', 'switch-selection'])
  })

  it('为所有运行时错误类别提供 i18n 键', () => {
    expect(aiRuntimeErrorMessageKey('network')).toBe('aiTextOps.errors.network')
    expect(aiRuntimeErrorMessageKey('model-missing')).toBe('aiTextOps.errors.modelMissing')
    expect(aiRuntimeErrorMessageKey('provider-invalid')).toBe('aiTextOps.errors.providerInvalid')
  })

  it('识别失败后内联供应商或模型选择是否已变化', () => {
    expect(hasRuntimeSelectionChanged(
      { providerId: 'a', modelId: 'model-a' },
      { providerId: 'a', modelId: 'model-a' },
    )).toBe(false)
    expect(hasRuntimeSelectionChanged(
      { providerId: 'a', modelId: 'model-a' },
      { providerId: 'b', modelId: 'model-b' },
    )).toBe(true)
    expect(hasRuntimeSelectionChanged(
      { providerId: 'a', modelId: 'model-a' },
      { providerId: 'a', modelId: 'model-a-other' },
    )).toBe(true)
  })
})

describe('错误技术详情脱敏', () => {
  it('遮蔽 sk- token、长随机串和精确 API Key', () => {
    const apiKey = 'custom-provider-secret-2026'
    const summary = [
      `Authorization was Bearer ${apiKey}`,
      'invalid key sk-liveabcdefghijklmnopqrstuvwxyz',
      'trace=abc123def456ghijklmnopqrstuvwxyz',
    ].join(' ')

    const redacted = redactSensitiveText(summary, { secrets: [apiKey] })
    expect(redacted).not.toContain(apiKey)
    expect(redacted).toContain('[redacted]')
    expect(redacted).not.toContain('sk-liveabcdefghijklmnopqrstuvwxyz')
    expect(redacted).toContain('sk-[redacted]')
    expect(redacted).not.toContain('abc123def456ghijklmnopqrstuvwxyz')
  })

  it('不遮蔽普通短模型 ID 或普通句子', () => {
    const value = 'Model gpt-4o-mini is unavailable; request id 42.'
    expect(redactSensitiveText(value)).toBe(value)
  })
})

describe('AI 错误卡片新增文案', () => {
  it('取消、恢复动作和技术详情键在中英文都存在', () => {
    for (const key of [
      'cancel',
      'errorDetails',
      'hideErrorDetails',
      'errorStatus',
      'errorEndpoint',
      'errorResponseSummary',
      'retry',
      'openProviderSettings',
      'switchProviderOrModel',
      'closeSwitchProviderOrModel',
      'retryWithNewProvider',
    ] as const) {
      expect(en.aiTextOps[key]).toBeTruthy()
      expect(zhCN.aiTextOps[key]).toBeTruthy()
    }
  })
})
