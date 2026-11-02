import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Automated candidate verification record.
//
// record  : merge per-OS smoke-check fragments + web e2e evidence into a
//           candidate-bound candidate-verification.json.
// validate: assert a verification record matches a candidate manifest and that
//           the check policy holds (PASS or SKIP everywhere; the checks that
//           the Verify candidate workflow actually executes must be PASS).
//
// Policy: automated verification replaces the former human QA evidence gate.
// Checks that cannot run in CI are recorded as SKIP, which is accepted by
// repository policy (see docs/desktop-release.md).

const CHECK_IDS = [
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

const IDENTITY_KEYS = ['repository', 'tag', 'commit', 'tagObject', 'runId']

function loadManifest(file) {
  const candidate = JSON.parse(readFileSync(file, 'utf8'))
  if (candidate.repository !== 'Aiden-FE/forge-x') throw new Error('wrong candidate repository')
  if (!/^v\d+\.\d+\.\d+$/.test(candidate.tag)) throw new Error('invalid candidate tag')
  for (const key of ['commit', 'tagObject']) {
    if (!/^[0-9a-f]{40}$/.test(candidate[key] ?? '')) throw new Error(`invalid candidate ${key}`)
  }
  if (!/^\d+$/.test(String(candidate.runId))) throw new Error('invalid candidate runId')
  if (!candidate.digests || typeof candidate.digests !== 'object') throw new Error('candidate digests missing')
  return candidate
}

async function successfulPrCheckRunUrl(commit) {
  const token = process.env.GH_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  if (!token || !repo) throw new Error('GH_TOKEN and GITHUB_REPOSITORY are required in record mode')
  const query = `actions/runs?head_sha=${commit}&status=completed&per_page=100`
  const response = await fetch(`https://api.github.com/repos/${repo}/${query}`, {
    headers: { authorization: `token ${token}`, 'user-agent': 'forgex-release-verification' },
  })
  if (!response.ok) throw new Error(`GitHub API ${response.status} while querying workflow runs`)
  const { workflow_runs: runs } = await response.json()
  const run = runs.find((item) => item.path === '.github/workflows/pr-check.yml' && item.conclusion === 'success')
  return run ? run.html_url : undefined
}

function readFragments(dir) {
  const merged = {}
  for (const entry of readdirSync(dir).sort()) {
    if (!entry.endsWith('.json')) continue
    const fragment = JSON.parse(readFileSync(join(dir, entry), 'utf8'))
    for (const [id, item] of Object.entries(fragment)) {
      const existing = merged[id]
      if (existing && (existing.status !== 'SKIP' || item.status !== 'SKIP')) {
        throw new Error(`duplicate non-SKIP check across fragments: ${id}`)
      }
      if (existing) {
        // Both platforms may SKIP the same policy row (e.g. unsigned install
        // prompts on Windows and macOS); merge the reasons.
        existing.reason = [existing.reason, item.reason].filter(Boolean).join(' | ')
      } else {
        merged[id] = item
      }
    }
  }
  return merged
}

async function record() {
  const [outFile, manifestFile, fragmentDir] = process.argv.slice(3)
  if (!outFile || !manifestFile || !fragmentDir) throw new Error('usage: record <out> <candidate-manifest> <fragments-dir>')
  const candidate = loadManifest(manifestFile)

  const checks = {}
  for (const id of CHECK_IDS) checks[id] = { status: 'SKIP', reason: 'not exercised by the verification workflow' }

  // OS smoke fragments overwrite their declared ids.
  for (const [id, item] of Object.entries(readFragments(fragmentDir))) {
    if (!CHECK_IDS.includes(id)) throw new Error(`fragment declares unknown check id: ${id}`)
    if (!['PASS', 'SKIP'].includes(item?.status)) throw new Error(`fragment check ${id} has invalid status`)
    checks[id] = item
  }

  // Browser regression + WebP offline conversion are covered by the Desktop PR
  // checks (web) Playwright suite, which must have succeeded on this commit.
  const prCheckUrl = await successfulPrCheckRunUrl(candidate.commit)
  const webEvidence = prCheckUrl
    ? { status: 'PASS', evidence: `Desktop PR checks (web) Playwright suite: ${prCheckUrl}` }
    : { status: 'SKIP', reason: 'no successful Desktop PR checks run found for the candidate commit' }
  for (const id of ['webp_wasm_offline_conversion', 'webp_multi_file_drop_individual_zip_cancel', 'browser_regression']) {
    checks[id] = webEvidence
  }

  const record = {
    schemaVersion: 1,
    repository: candidate.repository,
    tag: candidate.tag,
    commit: candidate.commit,
    tagObject: candidate.tagObject,
    runId: candidate.runId,
    digests: candidate.digests,
    verificationRunId: String(process.env.GITHUB_RUN_ID ?? 'local'),
    checks,
  }
  writeFileSync(outFile, `${JSON.stringify(record, null, 2)}\n`)
  const pass = Object.values(record.checks).filter((item) => item.status === 'PASS').length
  const skip = Object.values(record.checks).filter((item) => item.status === 'SKIP').length
  console.log(`candidate verification recorded: ${pass} PASS, ${skip} SKIP`)
}

function validate() {
  const [file, manifestFile] = process.argv.slice(3)
  if (!file || !manifestFile) throw new Error('usage: validate <candidate-verification.json> <candidate-manifest>')
  const candidate = loadManifest(manifestFile)
  const data = JSON.parse(readFileSync(file, 'utf8'))

  for (const key of IDENTITY_KEYS) {
    if (String(data[key]) !== String(candidate[key])) throw new Error(`verification record ${key} does not match candidate`)
  }
  if (JSON.stringify(data.digests) !== JSON.stringify(candidate.digests)) {
    throw new Error('verification record artifact digests differ from candidate')
  }
  if (!/^\d+$/.test(String(data.verificationRunId))) throw new Error('verificationRunId missing')

  const ids = Object.keys(data.checks ?? {}).sort()
  if (JSON.stringify(ids) !== JSON.stringify([...CHECK_IDS].sort())) {
    throw new Error(`verification check set mismatch; expected ${CHECK_IDS.join(', ')}, got ${ids.join(', ')}`)
  }
  for (const [id, item] of Object.entries(data.checks)) {
    if (!['PASS', 'SKIP'].includes(item?.status)) throw new Error(`check ${id} must be PASS or SKIP, got ${item?.status}`)
    if (item.status === 'PASS' && !(typeof item.evidence === 'string' && item.evidence.trim())) {
      throw new Error(`check ${id} is PASS without evidence`)
    }
    if (item.status === 'SKIP' && !(typeof (item.reason ?? item.evidence) === 'string' && (item.reason ?? item.evidence).trim())) {
      throw new Error(`check ${id} is SKIP without a reason`)
    }
  }
  // The checks the Verify candidate workflow actually executes (plus the
  // browser e2e suite it cites) must PASS; the rest may be SKIP by policy.
  const automated = [
    'windows11_x64_install_offline_tools',
    'macos_apple_silicon_first_open_offline_tools',
    'webp_wasm_offline_conversion',
    'webp_multi_file_drop_individual_zip_cancel',
    'browser_regression',
  ]
  for (const id of automated) {
    if (data.checks[id].status !== 'PASS') throw new Error(`automated check ${id} must PASS; got ${data.checks[id].status}`)
  }
  console.log(`candidate verification validated for ${candidate.tag} (run ${data.verificationRunId})`)
}

const [mode] = process.argv.slice(2)
if (mode === 'record') await record()
else if (mode === 'validate') validate()
else throw new Error('usage: candidate-verification.mjs record|validate <args>')
