import type { AiClientErrorCode } from '@/lib/aiClient'

export type AiRuntimeErrorCode = AiClientErrorCode

export type AiRuntimeRecoveryAction =
  | 'retry'
  | 'open-settings'
  | 'switch-selection'

export interface AiRuntimeError {
  code: AiRuntimeErrorCode
  status?: number
  endpoint?: string | null
  responseSummary?: string
}

const ERROR_MESSAGE_KEYS: Record<AiRuntimeErrorCode, string> = {
  'provider-invalid': 'providerInvalid',
  network: 'network',
  auth: 'auth',
  quota: 'quota',
  'model-missing': 'modelMissing',
  timeout: 'timeout',
  request: 'request',
  response: 'response',
}

const RECOVERY_ACTIONS: Record<AiRuntimeErrorCode, readonly AiRuntimeRecoveryAction[]> = {
  network: ['retry', 'open-settings'],
  auth: ['open-settings'],
  quota: ['switch-selection', 'open-settings'],
  'model-missing': ['open-settings', 'switch-selection'],
  timeout: ['retry', 'switch-selection'],
  request: ['retry', 'open-settings'],
  response: ['retry'],
  'provider-invalid': ['open-settings'],
}

export function aiRuntimeErrorMessageKey(errorCode: AiRuntimeErrorCode): string {
  return `aiTextOps.errors.${ERROR_MESSAGE_KEYS[errorCode]}`
}

/**
 * Keep the recovery matrix next to the tool so the accepted decision stays
 * testable independently of Vue rendering.
 */
export function recoveryActionsFor(
  errorCode: AiRuntimeErrorCode,
): readonly AiRuntimeRecoveryAction[] {
  return RECOVERY_ACTIONS[errorCode]
}

export interface AiRuntimeSelection {
  providerId?: string | null
  modelId?: string | null
}

export function hasRuntimeSelectionChanged(
  failedSelection: AiRuntimeSelection,
  currentSelection: AiRuntimeSelection,
): boolean {
  return failedSelection.providerId !== currentSelection.providerId
    || failedSelection.modelId !== currentSelection.modelId
}
