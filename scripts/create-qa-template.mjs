#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [dir, tag, commit, tagObject, runId] = process.argv.slice(2)
if (!dir || !/^v\d+\.\d+\.\d+$/.test(tag ?? '') || !/^[0-9a-f]{40}$/.test(commit ?? '') || !/^[0-9a-f]{40}$/.test(tagObject ?? '') || !/^\d+$/.test(runId ?? '')) throw new Error('usage: create-qa-template.mjs <release-dir> vX.Y.Z <commit> <tag-object> <run-id>')
const sha = (name) => createHash('sha256').update(readFileSync(join(dir, name))).digest('hex')
const version = tag.slice(1)
const names = [`ForgeX_${version}_universal.dmg`, `ForgeX_${version}_x64-setup.exe`]
const checks = [
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
const manual = (cpuArch, packageName) => ({ status: 'NOT_RUN', osVersion: '', osBuild: '', cpuArch, appVersion: version, packageName, packageSha256: '', steps: [], result: '', screenshots: [] })
const data = {
  repository: 'Aiden-FE/forge-x', tag, commit, tagObject, runId,
  digests: Object.fromEntries(names.map((name) => [name, sha(name)])),
  allRequiredChecksPassed: false,
  checks: Object.fromEntries(checks.map((key) => [key, { status: 'NOT_RUN', evidence: '' }])),
  manualMatrix: {
    windows11_standard: manual('x64', names[1]),
    windows11_policy: manual('x64', names[1]),
    macos14_intel: manual('x86_64', names[0]),
    macos_apple_silicon: manual('arm64', names[0]),
  },
}
for (const record of Object.values(data.manualMatrix)) record.packageSha256 = data.digests[record.packageName]
writeFileSync(join(dir, 'qa-evidence.template.json'), `${JSON.stringify(data, null, 2)}\n`)
console.log('created qa-evidence.template.json bound to candidate artifacts')
