<template>
  <div class="settings">
    <header class="page-header">
      <div>
        <h1>{{ t('settings.title') }}</h1>
        <p>{{ t('settings.subtitle', { count: String(store.enabledProviders.length) }) }}</p>
      </div>
    </header>

    <section class="security-alert" role="note">
      <AlertTriangle :size="18" />
      <div>
        <strong>{{ securityCopy.title }}</strong>
        <p>{{ securityCopy.detail }}</p>
      </div>
    </section>

    <p v-if="secureStorageError" class="form-error">
      {{ t('settings.errors.secureStorageUnavailable') }}
    </p>

    <section class="panel">
      <div class="panel-heading">
        <h2>{{ t('settings.newProvider') }}</h2>
      </div>
      <form class="form" @submit.prevent="submitCreate">
        <label class="field">
          <span>{{ t('settings.name') }}</span>
          <input v-model="createForm.name" type="text" :placeholder="t('settings.namePlaceholder')" />
        </label>
        <label class="field">
          <span>{{ t('settings.baseUrl') }}</span>
          <input v-model="createForm.baseURL" type="url" :placeholder="t('settings.baseUrlPlaceholder')" />
          <small>{{ t('settings.baseUrlHint') }}</small>
        </label>
        <label class="field">
          <span>{{ t('settings.apiKey') }}</span>
          <input v-model="createForm.apiKey" type="password" autocomplete="off" :placeholder="t('settings.apiKeyPlaceholder')" />
        </label>
        <label class="checkbox">
          <input v-model="createEnabled" type="checkbox" />
          <span>{{ t('settings.enabled') }}</span>
        </label>
        <p v-if="createError" class="form-error">{{ t(`settings.errors.${createError}`) }}</p>
        <div class="form-actions">
          <button type="submit" class="primary">{{ t('settings.add') }}</button>
        </div>
      </form>
    </section>

    <section class="provider-list">
      <article v-for="provider in store.providers" :key="provider.id" class="panel provider-card">
        <div class="provider-summary">
          <div>
            <h3>{{ provider.name }}</h3>
            <p>{{ provider.baseURL }}</p>
          </div>
          <div class="summary-actions">
            <button type="button" class="ghost" @click="startEdit(provider)">{{ t('settings.edit') }}</button>
            <button
              type="button"
              class="danger"
              :class="{ 'danger-confirm': pendingDeleteId === provider.id }"
              @click="removeProvider(provider)"
            >
              {{ pendingDeleteId === provider.id ? t('settings.confirmDeleteButton') : t('settings.delete') }}
            </button>
          </div>
        </div>

        <form v-if="editingProviderId === provider.id" class="form edit-form" @submit.prevent="submitEdit">
          <label class="field">
            <span>{{ t('settings.name') }}</span>
            <input v-model="editForm.name" type="text" />
          </label>
          <label class="field">
            <span>{{ t('settings.baseUrl') }}</span>
            <input v-model="editForm.baseURL" type="url" />
            <small>{{ t('settings.baseUrlHint') }}</small>
          </label>
          <label class="field">
            <span>{{ t('settings.apiKey') }}</span>
            <input v-model="editForm.apiKey" type="password" autocomplete="off" />
          </label>
          <p v-if="editError" class="form-error">{{ t(`settings.errors.${editError}`) }}</p>
          <div class="form-actions">
            <button type="submit" class="primary">{{ t('settings.save') }}</button>
            <button type="button" class="ghost" @click="cancelEdit">{{ t('settings.cancel') }}</button>
          </div>
        </form>

        <div class="provider-options">
          <label class="checkbox">
            <input
              type="checkbox"
              :checked="provider.enabled"
              :aria-label="t('settings.enabled')"
              @change="updateEnabled(provider, $event)"
            />
            <span>{{ t('settings.enabled') }}</span>
          </label>
          <label class="radio">
            <input
              type="radio"
              name="default-provider"
              :checked="store.defaultProviderId === provider.id"
              :aria-label="t('settings.defaultProvider')"
              @change="store.setDefaultProvider(provider.id)"
            />
            <span>{{ t('settings.defaultProvider') }}</span>
          </label>
        </div>

        <div class="connectivity">
          <div class="connectivity-heading">
            <h4>{{ t('providerCheck.title') }}</h4>
            <p>{{ t('providerCheck.quickHint') }}</p>
            <p>{{ t('providerCheck.deepHint') }}</p>
          </div>
          <div class="connectivity-actions">
            <button
              type="button"
              class="ghost small"
              :disabled="isProviderChecking(provider.id)"
              @click="runCheck(provider, 'quick')"
            >
              {{ getCheckState(provider.id).quick.loading
                ? t('providerCheck.quickLoading')
                : t('providerCheck.quick') }}
            </button>
            <label class="deep-model">
              <span>{{ t('providerCheck.modelLabel') }}</span>
              <select
                :value="selectedDeepModel(provider)"
                :disabled="provider.models.length === 0 || isProviderChecking(provider.id)"
                :aria-label="t('providerCheck.modelLabel')"
                @change="updateDeepModel(provider, $event)"
              >
                <option
                  v-for="model in provider.models"
                  :key="model"
                  :value="model"
                >
                  {{ model }}
                </option>
              </select>
            </label>
            <button
              type="button"
              class="ghost small"
              :disabled="provider.models.length === 0 || isProviderChecking(provider.id)"
              :title="provider.models.length === 0 ? t('providerCheck.noModels') : undefined"
              @click="runCheck(provider, 'deep')"
            >
              {{ getCheckState(provider.id).deep.loading
                ? t('providerCheck.deepLoading')
                : t('providerCheck.deep') }}
            </button>
          </div>
          <p
            v-if="getCheckState(provider.id).quick.status"
            class="check-result"
            :class="getCheckState(provider.id).quick.status === 'success' ? 'success' : 'error'"
            role="status"
          >
            {{ t(`providerCheck.result.${getCheckState(provider.id).quick.status}`) }}
          </p>
          <p
            v-if="provider.models.length === 0"
            class="connectivity-no-models"
          >
            {{ t('providerCheck.noModels') }}
          </p>
          <p
            v-else-if="getCheckState(provider.id).deep.status"
            class="check-result"
            :class="getCheckState(provider.id).deep.status === 'success' ? 'success' : 'error'"
            role="status"
          >
            {{ t(`providerCheck.result.${getCheckState(provider.id).deep.status}`) }}
          </p>
        </div>

        <div class="models">
          <h4>{{ t('settings.models') }}</h4>
          <p v-if="provider.models.length === 0" class="models-empty">{{ t('settings.modelsEmpty') }}</p>
          <ul v-else class="model-list">
            <li v-for="model in provider.models" :key="model">
              <label class="radio">
                <input
                  type="radio"
                  :name="`default-model-${provider.id}`"
                  :checked="provider.defaultModelId === model"
                  :aria-label="t('settings.defaultModel')"
                  @change="store.setProviderDefaultModel(provider.id, model)"
                />
                <span>{{ model }}</span>
              </label>
              <button type="button" class="danger small" @click="removeModel(provider, model)">
                {{ t('settings.removeModel') }}
              </button>
            </li>
          </ul>
          <form class="model-add" @submit.prevent="addModel(provider)">
            <input
              v-model="modelDrafts[provider.id]"
              type="text"
              :placeholder="t('settings.modelPlaceholder')"
              :aria-label="t('settings.modelId')"
            />
            <button type="submit" class="ghost">{{ t('settings.addModel') }}</button>
          </form>
        </div>
      </article>
    </section>

    <p v-if="store.providers.length === 0" class="empty">{{ t('settings.empty') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { isTauri } from '@/lib/desktop'
import { useProvidersStore } from '@/stores/providers'
import { normalizeProviderBaseUrl } from '@/lib/providers'
import {
  classifyCheckError,
  deepCheck,
  quickCheck,
  type ProviderCheckStatus,
} from '@/lib/providerCheck'
import { useI18n } from '@/composables/useI18n'
import type { Provider } from '@/types/provider'

type FormError =
  | 'requiredName'
  | 'requiredBaseUrl'
  | 'invalidBaseUrl'
  | 'requiredApiKey'
  | 'secureStorageUnavailable'

interface ProviderForm {
  name: string
  baseURL: string
  apiKey: string
}

type CheckKind = 'quick' | 'deep'

interface CheckUiState {
  status: ProviderCheckStatus | null
  loading: boolean
}

const { t } = useI18n()
const store = useProvidersStore()

const createForm = reactive<ProviderForm>({ name: '', baseURL: '', apiKey: '' })
const createEnabled = ref(true)
const createError = ref<FormError | null>(null)
const editForm = reactive<ProviderForm>({ name: '', baseURL: '', apiKey: '' })
const editError = ref<FormError | null>(null)
const editingProviderId = ref<string | null>(null)
const secureStorageError = ref(false)
const pendingDeleteId = ref<string | null>(null)
const modelDrafts = reactive<Record<string, string>>({})
const checkStates = reactive<Record<string, Record<CheckKind, CheckUiState>>>({})
const deepCheckModels = reactive<Record<string, string>>({})
const securityCopy = computed(() => isTauri
  ? {
      title: t('settings.desktopSecurityTitle'),
      detail: t('settings.desktopSecurityDetail'),
    }
  : {
      title: t('settings.securityTitle'),
      detail: t('settings.securityDetail'),
    })

function getCheckState(providerId: string): Record<CheckKind, CheckUiState> {
  const existing = checkStates[providerId]
  if (existing) return existing

  const state = {
    quick: { status: null, loading: false },
    deep: { status: null, loading: false },
  }
  checkStates[providerId] = state
  return state
}

function selectedDeepModel(provider: Provider): string {
  return deepCheckModels[provider.id]
    ?? provider.defaultModelId
    ?? provider.models[0]
    ?? ''
}

function updateDeepModel(provider: Provider, event: Event) {
  const select = event.target
  if (select instanceof HTMLSelectElement) {
    deepCheckModels[provider.id] = select.value
  }
}

function isProviderChecking(providerId: string): boolean {
  const state = getCheckState(providerId)
  return state.quick.loading || state.deep.loading
}

async function runCheck(provider: Provider, kind: CheckKind) {
  const state = getCheckState(provider.id)
  if (isProviderChecking(provider.id)) return

  const selectedModel = selectedDeepModel(provider)
  if (kind === 'deep' && !selectedModel) return

  state[kind].status = null
  state[kind].loading = true
  try {
    const result = kind === 'quick'
      ? await quickCheck(provider)
      : await deepCheck(provider, selectedModel)
    state[kind].status = result.status
  } catch (error) {
    state[kind].status = classifyCheckError(error)
  } finally {
    state[kind].loading = false
  }
}

function validateForm(form: ProviderForm): FormError | null {
  if (!form.name.trim()) return 'requiredName'
  if (!form.baseURL.trim()) return 'requiredBaseUrl'
  if (!normalizeProviderBaseUrl(form.baseURL)) return 'invalidBaseUrl'
  if (!form.apiKey.trim()) return 'requiredApiKey'
  return null
}

async function submitCreate() {
  createError.value = validateForm(createForm)
  if (createError.value) return

  try {
    const provider = await store.addProvider({
      ...createForm,
      models: [],
      enabled: createEnabled.value,
    })
    if (provider) {
      createForm.name = ''
      createForm.baseURL = ''
      createForm.apiKey = ''
      createEnabled.value = true
      createError.value = null
    }
  } catch {
    createError.value = 'secureStorageUnavailable'
  }
}

function startEdit(provider: Provider) {
  editingProviderId.value = provider.id
  pendingDeleteId.value = null
  editForm.name = provider.name
  editForm.baseURL = provider.baseURL
  editForm.apiKey = provider.apiKey
  editError.value = null
}

function cancelEdit() {
  editingProviderId.value = null
  editError.value = null
  pendingDeleteId.value = null
}

async function submitEdit() {
  if (!editingProviderId.value) return
  editError.value = validateForm(editForm)
  if (editError.value) return

  try {
    const updated = await store.updateProvider(editingProviderId.value, { ...editForm })
    if (updated) {
      cancelEdit()
    }
  } catch {
    editError.value = 'secureStorageUnavailable'
  }
}

async function removeProvider(provider: Provider) {
  if (pendingDeleteId.value !== provider.id) {
    pendingDeleteId.value = provider.id
    return
  }
  pendingDeleteId.value = null
    secureStorageError.value = false
    try {
      await store.removeProvider(provider.id)
      delete modelDrafts[provider.id]
      delete checkStates[provider.id]
      delete deepCheckModels[provider.id]
      if (editingProviderId.value === provider.id) cancelEdit()
    } catch {
      secureStorageError.value = true
    }
}

async function updateEnabled(provider: Provider, event: Event) {
  const input = event.target
  if (input instanceof HTMLInputElement) {
    try {
      await store.updateProvider(provider.id, { enabled: input.checked })
    } catch {
      secureStorageError.value = true
    }
  }
}

async function addModel(provider: Provider) {
  try {
    const added = await store.addProviderModel(provider.id, modelDrafts[provider.id] ?? '')
    if (added) {
      modelDrafts[provider.id] = ''
    }
  } catch {
    secureStorageError.value = true
  }
}

async function removeModel(provider: Provider, model: string) {
  try {
    await store.removeProviderModel(provider.id, model)
  } catch {
    secureStorageError.value = true
  }
}
</script>

<style scoped>
.settings {
  max-width: 860px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.page-header h1 {
  font-size: 24px;
  font-weight: 560;
  color: var(--text-primary);
}

.page-header p,
.security-alert p,
.models-empty,
.empty {
  color: var(--text-tertiary);
  font-size: 14px;
}

.security-alert {
  display: flex;
  gap: var(--space-md);
  padding: var(--space-lg);
  border: 1px solid color-mix(in srgb, var(--warning) 35%, transparent);
  background: color-mix(in srgb, var(--warning) 8%, transparent);
  border-radius: var(--radius-lg);
}

.security-alert svg {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--warning);
}

.security-alert strong {
  color: var(--text-primary);
  font-size: 14px;
}

.security-alert p {
  margin-top: var(--space-xs);
  line-height: 1.5;
}

.panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
}

.panel-heading h2,
.provider-summary h3 {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 550;
}

.provider-summary p {
  margin-top: var(--space-xs);
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 12px;
}

.form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-md);
  margin-top: var(--space-lg);
}

.edit-form {
  border-top: 1px solid var(--border-subtle);
  padding-top: var(--space-lg);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.field:nth-child(2) {
  grid-column: 1 / -1;
}

.field span,
.models h4 {
  color: var(--text-secondary);
  font-size: 13px;
}

input[type='text'],
input[type='url'],
input[type='password'] {
  width: 100%;
  height: 36px;
  padding: 0 var(--space-md);
  color: var(--text-primary);
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  outline: none;
  transition: border-color var(--transition-fast);
}

input:focus {
  border-color: var(--border-focus);
}

small {
  color: var(--text-quaternary);
  font-size: 12px;
}

.checkbox,
.radio {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.checkbox input,
.radio input {
  accent-color: var(--accent);
}

.form-actions,
.provider-options,
.summary-actions {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.form-actions {
  grid-column: 1 / -1;
}

.form-error {
  grid-column: 1 / -1;
  color: var(--error);
  font-size: 13px;
}

.connectivity {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  border-top: 1px solid var(--border-subtle);
  padding-top: var(--space-lg);
}

.connectivity-heading h4 {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 550;
}

.connectivity-heading p,
.connectivity-no-models {
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.connectivity-heading p:first-of-type {
  margin-top: var(--space-xs);
}

.connectivity-actions {
  display: flex;
  align-items: flex-end;
  gap: var(--space-md);
}

.deep-model {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-width: 220px;
}

.deep-model span {
  color: var(--text-secondary);
  font-size: 13px;
}

.deep-model select {
  width: 100%;
  height: 36px;
  padding: 0 var(--space-md);
  color: var(--text-primary);
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  outline: none;
}

.deep-model select:focus {
  border-color: var(--border-focus);
}

.deep-model select:disabled,
button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.connectivity-no-models,
.check-result {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.check-result.success {
  color: var(--success);
}

.check-result.error {
  color: var(--error);
}

button {
  height: 34px;
  padding: 0 var(--space-lg);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

button.small {
  height: 28px;
  padding: 0 var(--space-md);
}

button.primary {
  color: #fff;
  background: var(--accent-bg);
}

button.primary:hover {
  background: var(--accent-hover);
}

button.ghost {
  color: var(--text-secondary);
  background: transparent;
  border-color: var(--border);
}

button.ghost:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

button.danger {
  color: var(--error);
  background: transparent;
  border-color: color-mix(in srgb, var(--error) 35%, transparent);
}

button.danger:hover {
  background: color-mix(in srgb, var(--error) 10%, transparent);
}

.provider-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.provider-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.provider-summary {
  display: flex;
  justify-content: space-between;
  gap: var(--space-lg);
}

.models {
  border-top: 1px solid var(--border-subtle);
  padding-top: var(--space-lg);
}

.models ul {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin: var(--space-md) 0;
  padding: 0;
  list-style: none;
}

.models li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.models li span {
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
}

.model-add {
  display: flex;
  gap: var(--space-md);
}

.empty {
  text-align: center;
  padding: var(--space-2xl);
}

@media (max-width: 700px) {
  .form {
    grid-template-columns: 1fr;
  }

  .provider-summary {
    flex-direction: column;
    align-items: flex-start;
  }

  .connectivity-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .deep-model {
    min-width: 0;
  }
}
</style>
