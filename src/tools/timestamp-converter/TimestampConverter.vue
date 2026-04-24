<template>
  <ToolLayout :tool="toolMeta">
    <div class="timestamp-tool">
      <div class="grid">
        <div class="panel">
          <label class="label">时间戳</label>
          <input
            v-model="timestamp"
            type="text"
            class="input"
            placeholder="输入时间戳 (秒或毫秒)"
          />
          <button class="btn primary" @click="fromTimestamp">
            <ArrowDown :size="16" />
            转换为日期
          </button>
        </div>
        <div class="panel">
          <label class="label">日期时间</label>
          <input
            v-model="datetime"
            type="text"
            class="input"
            placeholder="输入日期 (YYYY-MM-DD HH:mm:ss)"
          />
          <button class="btn" @click="toTimestamp">
            <ArrowUp :size="16" />
            转换为时间戳
          </button>
        </div>
      </div>
      <div class="current">
        <div class="current-row">
          <span class="current-label">当前时间戳</span>
          <code class="current-value">{{ currentTimestamp }}</code>
          <button class="btn small" @click="copyCurrent">
            <Copy :size="14" />
          </button>
        </div>
        <div class="current-row">
          <span class="current-label">当前时间</span>
          <code class="current-value">{{ currentDatetime }}</code>
        </div>
      </div>
      <div class="panel output">
        <label class="label">转换结果</label>
        <div class="result">
          <code class="result-value">{{ result }}</code>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
      </div>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ArrowUp, ArrowDown, Copy } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import type { ToolMeta } from '@/types/tool'
import TimestampConverter from './TimestampConverter.vue'

const toolMeta: ToolMeta = {
  id: 'timestamp-converter',
  name: '时间戳转换',
  description: '时间戳与日期时间互相转换',
  category: 'convert',
  icon: 'CalendarClock',
  component: TimestampConverter,
  keywords: ['timestamp', 'date', 'time', '时间戳', '日期']
}

const timestamp = ref('')
const datetime = ref('')
const result = ref('')
const error = ref('')
const currentTimestamp = ref('')
const currentDatetime = ref('')

let timer: number

function updateCurrent() {
  const now = Date.now()
  currentTimestamp.value = now.toString()
  currentDatetime.value = formatDate(now)
}

onMounted(() => {
  updateCurrent()
  timer = window.setInterval(updateCurrent, 1000)
})

onUnmounted(() => {
  clearInterval(timer)
})

function formatDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function fromTimestamp() {
  error.value = ''
  result.value = ''
  const ts = timestamp.value.trim()
  if (!ts) {
    error.value = '请输入时间戳'
    return
  }
  let ms: number
  if (ts.length > 10) {
    ms = parseInt(ts)
  } else {
    ms = parseInt(ts) * 1000
  }
  if (isNaN(ms)) {
    error.value = '无效的时间戳'
    return
  }
  result.value = formatDate(ms)
}

function toTimestamp() {
  error.value = ''
  result.value = ''
  const dt = datetime.value.trim()
  if (!dt) {
    error.value = '请输入日期时间'
    return
  }
  const d = new Date(dt)
  if (d.toString() === 'Invalid Date') {
    error.value = '无效的日期格式'
    return
  }
  result.value = Math.floor(d.getTime() / 1000).toString() + ' (秒)\n' + d.getTime().toString() + ' (毫秒)'
}

function copyCurrent() {
  navigator.clipboard.writeText(currentTimestamp.value)
}
</script>

<style scoped>
.timestamp-tool {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-lg);
}

@media (max-width: 600px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
}

.input {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 14px;
  padding: var(--space-md);
  outline: none;
  transition: border-color var(--transition-fast);
}

.input:focus {
  border-color: var(--border-focus);
}

.input::placeholder {
  color: var(--text-quaternary);
}

.btn {
  display: flex;
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
  transition: all var(--transition-fast);
}

.btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.btn.primary:hover {
  background: var(--accent-hover);
}

.btn.small {
  padding: var(--space-xs) var(--space-sm);
}

.current {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.current-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.current-label {
  color: var(--text-tertiary);
  font-size: 13px;
}

.current-value {
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 14px;
}

.result {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}

.result-value {
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 14px;
  white-space: pre-wrap;
}

.error {
  color: var(--error);
  font-size: 13px;
}
</style>