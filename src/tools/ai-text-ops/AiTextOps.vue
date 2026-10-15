<template>
  <ToolLayout :tool="toolMeta">
    <div class="ai-text-tool">
      <div v-if="providersStore.enabledProviders.length === 0" class="panel setup" data-test="ai-setup">
        <div class="setup-icon">
          <Settings :size="22" />
        </div>
        <div class="setup-content">
          <h2 class="setup-title">{{ t('aiTextOps.setupTitle') }}</h2>
          <p class="setup-description">{{ t('aiTextOps.setupDescription') }}</p>
        </div>
        <router-link class="btn primary setup-action" to="/settings/providers">
          {{ t('aiTextOps.setupAction') }}
        </router-link>
      </div>

      <template v-else>
        <div class="panel selector" data-test="ai-provider-selector">
          <div class="selector-grid">
            <div class="selector-field">
              <label class="label" for="ai-provider-select">{{ t('aiTextOps.providerLabel') }}</label>
              <select
                id="ai-provider-select"
                class="select"
                data-test="ai-provider-select"
                :value="activeProvider?.id ?? ''"
                :disabled="loading"
                @change="onProviderChange"
              >
                <option value="" disabled>{{ t('aiTextOps.notSelected') }}</option>
                <option
                  v-for="item in providersStore.enabledProviders"
                  :key="item.id"
                  :value="item.id"
                >
                  {{ item.name }}
                </option>
              </select>
            </div>
            <div class="selector-field">
              <label class="label" for="ai-model-select">{{ t('aiTextOps.modelLabel') }}</label>
              <select
                id="ai-model-select"
                class="select"
                data-test="ai-model-select"
                :value="activeModelId ?? ''"
                :disabled="loading || !activeProvider"
                @change="onModelChange"
              >
                <option value="" disabled>{{ t('aiTextOps.notSelected') }}</option>
                <option
                  v-for="model in activeProvider?.models ?? []"
                  :key="model"
                  :value="model"
                >
                  {{ model }}
                </option>
              </select>
            </div>
          </div>
          <p class="selector-current" data-test="ai-current-selection">
            {{ t('aiTextOps.currentSelection', {
              provider: activeProvider?.name ?? t('aiTextOps.notSelected'),
              model: activeModelId ?? t('aiTextOps.notSelected'),
            }) }}
          </p>
        </div>

        <div class="panel">
          <label class="label" for="ai-text-input">{{ t('aiTextOps.inputLabel') }}</label>
          <textarea
            id="ai-text-input"
            v-model="input"
            class="textarea"
            data-test="ai-input"
            :placeholder="t('aiTextOps.inputPlaceholder')"
            rows="8"
          />
        </div>

        <div class="actions">
          <button
            class="btn primary"
            v-for="task in taskControls"
            :key="task.id"
            :data-test="task.id === 'translate' ? 'ai-translate' : `ai-task-${task.id}`"
            :disabled="loading"
            @click="runTask(task.id)"
          >
            <component :is="task.icon" :size="16" />
            {{ activeTaskId === task.id ? t(task.loadingKey) : t(task.labelKey) }}
          </button>
          <button class="btn" data-test="ai-clear" :disabled="loading" @click="clear">
            <Trash2 :size="16" />
            {{ t('aiTextOps.clear') }}
          </button>
          <button
            v-if="loading"
            class="btn danger"
            data-test="ai-cancel"
            @click="cancelRequest"
          >
            <CircleStop :size="16" />
            {{ t('aiTextOps.cancel') }}
          </button>
        </div>

        <div class="panel output">
          <label class="label" for="ai-text-output">{{ t('aiTextOps.resultLabel') }}</label>
          <p v-if="emptyInputError" class="error" data-test="ai-empty-input-error">
            {{ t('aiTextOps.errors.empty') }}
          </p>
          <textarea
            id="ai-text-output"
            v-model="output"
            class="textarea"
            data-test="ai-output"
            :placeholder="t('aiTextOps.outputPlaceholder')"
            readonly
            rows="8"
          />
          <article
            v-if="failure"
            class="error-card"
            data-test="ai-error-card"
            role="alert"
          >
            <p class="error-message" data-test="ai-error-message">
              {{ t(aiRuntimeErrorMessageKey(failure.errorCode)) }}
            </p>

            <div class="error-actions">
              <template
                v-for="action in failureRecoveryActions"
                :key="action"
              >
                <button
                  v-if="action === 'retry'"
                  class="btn primary"
                  data-test="ai-error-retry"
                  @click="retryFailedTask"
                >
                  <RotateCcw :size="16" />
                  {{ retryLabel }}
                </button>
                <router-link
                  v-else-if="action === 'open-settings'"
                  class="btn"
                  data-test="ai-error-open-settings"
                  to="/settings/providers"
                >
                  <Settings :size="16" />
                  {{ t('aiTextOps.openProviderSettings') }}
                </router-link>
                <button
                  v-else
                  class="btn"
                  data-test="ai-error-toggle-switch"
                  @click="switchSelectionOpen = !switchSelectionOpen"
                >
                  <ArrowLeftRight :size="16" />
                  {{ switchSelectionOpen
                    ? t('aiTextOps.closeSwitchProviderOrModel')
                    : t('aiTextOps.switchProviderOrModel') }}
                </button>
              </template>
            </div>

            <div v-if="switchSelectionOpen" class="inline-selection">
              <div class="selector-field">
                <label class="label" for="ai-error-provider-select">
                  {{ t('aiTextOps.providerLabel') }}
                </label>
                <select
                  id="ai-error-provider-select"
                  class="select"
                  data-test="ai-error-provider-select"
                  :value="activeProvider?.id ?? ''"
                  :disabled="loading"
                  @change="onProviderChange"
                >
                  <option value="" disabled>{{ t('aiTextOps.notSelected') }}</option>
                  <option
                    v-for="item in providersStore.enabledProviders"
                    :key="item.id"
                    :value="item.id"
                  >
                    {{ item.name }}
                  </option>
                </select>
              </div>
              <div class="selector-field">
                <label class="label" for="ai-error-model-select">
                  {{ t('aiTextOps.modelLabel') }}
                </label>
                <select
                  id="ai-error-model-select"
                  class="select"
                  data-test="ai-error-model-select"
                  :value="activeModelId ?? ''"
                  :disabled="loading || !activeProvider"
                  @change="onModelChange"
                >
                  <option value="" disabled>{{ t('aiTextOps.notSelected') }}</option>
                  <option
                    v-for="model in activeProvider?.models ?? []"
                    :key="model"
                    :value="model"
                  >
                    {{ model }}
                  </option>
                </select>
              </div>
            </div>

            <div class="error-details">
              <button
                class="details-toggle"
                data-test="ai-error-details-toggle"
                type="button"
                @click="errorDetailsOpen = !errorDetailsOpen"
              >
                <ChevronDown :class="{ expanded: errorDetailsOpen }" :size="14" />
                {{ errorDetailsOpen
                  ? t('aiTextOps.hideErrorDetails')
                  : t('aiTextOps.errorDetails') }}
              </button>
              <dl v-if="errorDetailsOpen" class="details-list" data-test="ai-error-details">
                <div v-if="failure.error.status !== undefined">
                  <dt>{{ t('aiTextOps.errorStatus') }}</dt>
                  <dd data-test="ai-error-status">{{ failure.error.status }}</dd>
                </div>
                <div v-if="failure.error.endpoint">
                  <dt>{{ t('aiTextOps.errorEndpoint') }}</dt>
                  <dd data-test="ai-error-endpoint">{{ failure.error.endpoint }}</dd>
                </div>
                <div v-if="failure.error.responseSummary">
                  <dt>{{ t('aiTextOps.errorResponseSummary') }}</dt>
                  <dd data-test="ai-error-response-summary">
                    {{ failure.error.responseSummary }}
                  </dd>
                </div>
              </dl>
            </div>
          </article>
        </div>
      </template>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ArrowLeftRight,
  ChevronDown,
  CircleStop,
  FileText,
  Languages,
  Lightbulb,
  RotateCcw,
  Settings,
  Smile,
  Sparkles,
  Trash2,
} from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import { useProvidersStore } from '@/stores/providers'
import type { ToolMeta } from '@/types/tool'
import {
  AI_TEXT_TASKS,
  runAiTextTask,
  type AiTextTaskId,
  type AiTextTaskResult,
} from './task'
import {
  aiRuntimeErrorMessageKey,
  hasRuntimeSelectionChanged,
  recoveryActionsFor,
} from './runtime'
import { useAiTextTaskSelection } from './selection'
import AiTextOps from './AiTextOps.vue'

const { t } = useI18n()
const providersStore = useProvidersStore()
const {
  activeProvider,
  activeModelId,
  selectProvider,
  selectModel,
} = useAiTextTaskSelection(providersStore)

const toolMeta: ToolMeta = {
  id: 'ai-text-ops',
  name: 'AI Text Operations',
  description: 'Translate text with your default provider',
  category: 'ai',
  icon: 'Languages',
  component: AiTextOps,
  keywords: ['ai', 'translate', 'translation', 'polish', 'summarize', '翻译', '润色', '摘要'],
}

const input = ref('')
const output = ref('')
const loading = ref(false)
const activeTaskId = ref<AiTextTaskId | null>(null)
const activeController = ref<AbortController | null>(null)
type AiTextUiFailure = Extract<AiTextTaskResult, { kind: 'failure' }> & {
  taskId: AiTextTaskId
  providerId: string | null
  modelId: string | null
}
const failure = ref<AiTextUiFailure | null>(null)
const errorDetailsOpen = ref(false)
const switchSelectionOpen = ref(false)
const emptyInputError = ref(false)

const taskIcons: Record<AiTextTaskId, typeof Languages> = {
  translate: Languages,
  polish: Sparkles,
  summarize: FileText,
  tone: Smile,
  explain: Lightbulb,
}

const taskControls = AI_TEXT_TASKS.map(id => ({
  id,
  labelKey: `aiTextOps.tasks.${id}`,
  loadingKey: `aiTextOps.running.${id}`,
  icon: taskIcons[id],
}))

const failureRecoveryActions = computed(() => {
  return failure.value ? recoveryActionsFor(failure.value.errorCode) : []
})

const selectionChanged = computed(() => {
  if (!failure.value) return false
  return hasRuntimeSelectionChanged(
    {
      providerId: failure.value.providerId,
      modelId: failure.value.modelId,
    },
    {
      providerId: activeProvider.value?.id ?? null,
      modelId: activeModelId.value,
    },
  )
})

const retryLabel = computed(() => selectionChanged.value
  ? t('aiTextOps.retryWithNewProvider')
  : t('aiTextOps.retry'))

function onProviderChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  selectProvider(value || null)
}

function onModelChange(event: Event) {
  selectModel((event.target as HTMLSelectElement).value)
}

async function runTask(taskId: AiTextTaskId, retryInput?: string) {
  if (loading.value) return
  const requestInput = retryInput ?? input.value
  if (!requestInput.trim()) {
    input.value = requestInput
    output.value = ''
    failure.value = null
    errorDetailsOpen.value = false
    switchSelectionOpen.value = false
    emptyInputError.value = true
    return
  }

  failure.value = null
  errorDetailsOpen.value = false
  switchSelectionOpen.value = false
  emptyInputError.value = false
  output.value = ''
  loading.value = true
  activeTaskId.value = taskId

  const requestedProviderId = activeProvider.value?.id ?? null
  const requestedModelId = activeModelId.value
  const controller = new AbortController()
  activeController.value = controller

  const request = runAiTextTask(
    activeProvider.value,
    taskId,
    requestInput,
    { modelId: requestedModelId, signal: controller.signal },
  )
  const cancellation = new Promise<{ kind: 'cancelled' }>((resolve) => {
    if (controller.signal.aborted) {
      resolve({ kind: 'cancelled' })
      return
    }
    controller.signal.addEventListener(
      'abort',
      () => resolve({ kind: 'cancelled' }),
      { once: true },
    )
  })
  const result = await Promise.race([request, cancellation])

  if (result.kind === 'cancelled') {
    // Cancellation intentionally writes neither output nor an error card.
  } else if (result.kind === 'success') {
    output.value = result.output
  } else if (result.kind === 'failure') {
    failure.value = {
      ...result,
      taskId,
      providerId: requestedProviderId,
      modelId: requestedModelId,
    }
  } else if (result.kind === 'empty-input') {
    failure.value = {
      kind: 'failure',
      input: result.input,
      errorCode: 'provider-invalid',
      error: { code: 'provider-invalid' },
      taskId,
      providerId: requestedProviderId,
      modelId: requestedModelId,
    }
  } else {
    failure.value = {
      kind: 'failure',
      input: result.input,
      errorCode: 'provider-invalid',
      error: { code: 'provider-invalid' },
      taskId,
      providerId: requestedProviderId,
      modelId: requestedModelId,
    }
  }

  loading.value = false
  activeTaskId.value = null
  if (activeController.value === controller) {
    activeController.value = null
  }
}

function cancelRequest() {
  activeController.value?.abort()
}

function retryFailedTask() {
  if (!failure.value) return
  input.value = failure.value.input
  void runTask(failure.value.taskId, failure.value.input)
}

function clear() {
  input.value = ''
  output.value = ''
  failure.value = null
  errorDetailsOpen.value = false
  switchSelectionOpen.value = false
  emptyInputError.value = false
}
</script>

<style scoped>
.ai-text-tool {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.setup {
  flex-direction: row;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.selector {
  gap: var(--space-md);
  padding: var(--space-lg);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.selector-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-md);
}

.selector-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.select {
  appearance: none;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  padding: var(--space-sm) var(--space-md);
  outline: none;
  transition: border-color var(--transition-fast);
}

.select:focus {
  border-color: var(--border-focus);
}

.selector-current {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.setup-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--bg-hover);
  color: var(--accent);
  flex-shrink: 0;
}

.setup-content {
  flex: 1;
}

.setup-title {
  margin: 0 0 var(--space-2xs);
  font-size: 16px;
  font-weight: 550;
  color: var(--text-primary);
}

.setup-description {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
}

.textarea {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: var(--space-md);
  resize: vertical;
  outline: none;
  transition: border-color var(--transition-fast);
}

.textarea:focus {
  border-color: var(--border-focus);
}

.textarea::placeholder {
  color: var(--text-quaternary);
}

.actions {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
  transition: all var(--transition-fast);
}

.btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.btn.primary:hover {
  background: var(--accent-hover);
}

.error {
  color: var(--error);
  font-size: 13px;
  margin: var(--space-sm) 0 0;
}

.error-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  margin-top: var(--space-sm);
  padding: var(--space-md);
  background: color-mix(in srgb, var(--error) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--error) 35%, transparent);
  border-radius: var(--radius-md);
}

.error-message {
  margin: 0;
  color: var(--error);
  font-size: 13px;
  line-height: 1.5;
}

.error-actions,
.inline-selection {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.inline-selection {
  padding-top: var(--space-sm);
  border-top: 1px solid var(--border);
}

.inline-selection .selector-field {
  min-width: min(260px, 100%);
}

.error-details {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.details-toggle {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.details-toggle:hover {
  color: var(--text-primary);
}

.details-toggle svg {
  transition: transform var(--transition-fast);
}

.details-toggle svg.expanded {
  transform: rotate(180deg);
}

.details-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin: 0;
  padding: var(--space-sm);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow-wrap: anywhere;
}

.details-list div {
  display: grid;
  gap: var(--space-2xs);
}

.details-list dt {
  color: var(--text-secondary);
  font-size: 12px;
}

.details-list dd {
  margin: 0;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: pre-wrap;
}

.btn.danger {
  color: var(--error);
  border-color: color-mix(in srgb, var(--error) 45%, transparent);
}

@media (max-width: 640px) {
  .selector-grid {
    grid-template-columns: 1fr;
  }

  .setup {
    flex-direction: column;
    align-items: stretch;
    text-align: center;
  }

  .setup-content {
    flex: 0 0 auto;
  }
}
</style>
