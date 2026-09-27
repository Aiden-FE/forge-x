import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const [mode, file = 'release-qa-evidence.json', candidateFile = 'release/candidate-manifest.json'] = process.argv.slice(2)
const requiredChecks = [
  'windows11_x64_install_offline_tools',
  'windows11_x64_smart_app_control_or_managed_policy',
  'macos14_intel_first_open_offline_tools',
  'macos_apple_silicon_first_open_offline_tools',
  'webp_wasm_offline_conversion',
  'webp_multi_file_drop_individual_zip_cancel',
  'menu_shortcuts_close_reopen',
  'preferences_restart_manual_upgrade',
  'browser_regression',
  'unsigned_security_prompts',
]
const required = (key) => {
  const value = process.env[key]?.trim()
  if (!value) throw new Error(`${key} is required`)
  return value
}
function validateUrl(raw) {
  const url = new URL(raw)
  const parts = url.pathname.split('/').filter(Boolean)
  if (url.protocol !== 'https:' || url.hostname !== 'raw.githubusercontent.com' || url.username || url.password || url.port || url.search || url.hash || parts[0] !== 'Aiden-FE' || parts[1] !== 'forge-x' || !/^[0-9a-f]{40}$/.test(parts[2] ?? '') || parts.length < 4) {
    throw new Error('QA URL must pin a raw Aiden-FE/forge-x blob at a 40-character commit')
  }
  return url
}
function verifyEvidence(data, candidate) {
  for (const key of ['repository', 'tag', 'commit', 'tagObject', 'runId']) {
    if (data[key] !== candidate[key]) throw new Error(`QA evidence ${key} does not match candidate`)
  }
  if (JSON.stringify(data.digests) !== JSON.stringify(candidate.digests)) throw new Error('QA evidence artifact digests differ')
  if (!data.checks || typeof data.checks !== 'object' || Array.isArray(data.checks)) throw new Error('QA checks missing')
  for (const key of requiredChecks) {
    const item = data.checks[key]
    if (!item || item.status !== 'PASS' || typeof item.evidence !== 'string' || !item.evidence.trim()) {
      throw new Error(`release-blocking QA check ${key} is missing, NOT_RUN or lacks evidence`)
    }
  }
  if (Object.keys(data.checks).length !== requiredChecks.length || Object.keys(data.checks).some((key) => !requiredChecks.includes(key))) throw new Error('QA check set does not match the required matrix')
  if (data.allRequiredChecksPassed !== true) throw new Error('QA must explicitly attest all checks passed')
  const platforms = {
    windows11_standard: { arch: 'x64', packageName: Object.keys(candidate.digests).find((name) => name.endsWith('_x64-setup.exe')) },
    windows11_policy: { arch: 'x64', packageName: Object.keys(candidate.digests).find((name) => name.endsWith('_x64-setup.exe')) },
    macos14_intel: { arch: 'x86_64', packageName: Object.keys(candidate.digests).find((name) => name.endsWith('_universal.dmg')) },
    macos_apple_silicon: { arch: 'arm64', packageName: Object.keys(candidate.digests).find((name) => name.endsWith('_universal.dmg')) },
  }
  for (const [scenario, platform] of Object.entries(platforms)) {
    const record = data.manualMatrix?.[scenario]
    const screenshotsComplete = Array.isArray(record?.screenshots) && record.screenshots.length > 0 && record.screenshots.every((shot) => typeof shot === 'string' && shot.trim())
    if (!record || record.status !== 'PASS' || !platform.packageName || record.cpuArch !== platform.arch || record.packageName !== platform.packageName || record.packageSha256 !== candidate.digests[platform.packageName] || record.appVersion !== candidate.tag.slice(1) || typeof record.osVersion !== 'string' || !record.osVersion.trim() || typeof record.osBuild !== 'string' || !record.osBuild.trim() || !Array.isArray(record.steps) || record.steps.length === 0 || record.steps.some((step) => typeof step !== 'string' || !step.trim()) || typeof record.result !== 'string' || !record.result.trim() || !screenshotsComplete) {
      throw new Error(`incomplete manual matrix record: ${scenario}`)
    }
  }
}
function loadCandidate() {
  const candidate = JSON.parse(readFileSync(candidateFile, 'utf8'))
  if (candidate.repository !== 'Aiden-FE/forge-x') throw new Error('wrong candidate repository')
  if (!/^v\d+\.\d+\.\d+$/.test(candidate.tag) || !/^[0-9a-f]{40}$/.test(candidate.commit) || !/^[0-9a-f]{40}$/.test(candidate.tagObject) || !/^\d+$/.test(String(candidate.runId))) throw new Error('invalid candidate identity')
  return candidate
}
const candidate = loadCandidate()
const rawUrl = required('QA_EVIDENCE_URL')
const url = validateUrl(rawUrl)
const expectedSha = required('QA_EVIDENCE_SHA256').toLowerCase()
if (!/^[0-9a-f]{64}$/.test(expectedSha)) throw new Error('invalid QA evidence SHA-256')

if (mode === 'create') {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  let body
  try {
    const response = await fetch(url, { redirect: 'error', signal: controller.signal })
    if (!response.ok) throw new Error(`QA evidence HTTP ${response.status}`)
    body = Buffer.from(await response.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
  if (body.length > 256 * 1024) throw new Error('QA evidence too large')
  const digest = createHash('sha256').update(body).digest('hex')
  if (digest !== expectedSha) throw new Error('QA evidence digest mismatch')
  const attestation = JSON.parse(body.toString('utf8'))
  verifyEvidence(attestation, candidate)
  writeFileSync(file, `${JSON.stringify({ schemaVersion: 1, source: url.href, sha256: digest, evidenceCommit: url.pathname.split('/')[3], evidenceBodyBase64: body.toString('base64'), candidate }, null, 2)}\n`)
} else if (mode === 'validate') {
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  if (manifest.schemaVersion !== 1 || manifest.source !== url.href || manifest.sha256 !== expectedSha || manifest.evidenceCommit !== url.pathname.split('/')[3]) throw new Error('QA source manifest changed')
  if (JSON.stringify(manifest.candidate) !== JSON.stringify(candidate)) throw new Error('candidate identity changed')
  const body = Buffer.from(manifest.evidenceBodyBase64, 'base64')
  if (body.length > 256 * 1024 || createHash('sha256').update(body).digest('hex') !== expectedSha) throw new Error('QA manifest evidence bytes/digest mismatch')
  verifyEvidence(JSON.parse(body.toString('utf8')), candidate)
} else {
  throw new Error('usage: release-evidence.mjs create|validate <output> <candidate-manifest>')
}
console.log('release-blocking QA evidence verified')
