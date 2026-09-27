import { createHash } from 'node:crypto'
import { closeSync, openSync, readFileSync, readdirSync, readSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [mode, directory, tag, commit, tagObject, runId] = process.argv.slice(2)
const version = tag?.match(/^v(\d+\.\d+\.\d+)$/)?.[1]
if (!['create', 'verify'].includes(mode) || !directory || !version) throw new Error('invalid release-artifacts invocation')
if (![commit, tagObject].every((value) => /^[0-9a-f]{40}$/.test(value ?? '')) || !/^\d+$/.test(runId ?? '')) throw new Error('candidate requires commit SHA, tag object SHA and run ID')

const names = [`ForgeX_${version}_universal.dmg`, `ForgeX_${version}_x64-setup.exe`]
const manifestPath = join(directory, 'candidate-manifest.json')
const sumsPath = join(directory, 'SHA256SUMS')
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
function prefix(file, size) {
  const fd = openSync(file, 'r')
  try { const b = Buffer.alloc(size); readSync(fd, b, 0, size, 0); return b } finally { closeSync(fd) }
}

const actual = readdirSync(directory).sort()
const expected = mode === 'create' ? names.slice().sort() : [...names, 'candidate-manifest.json', 'SHA256SUMS', 'qa-evidence.template.json'].sort()
if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`artifact set mismatch; expected ${expected}, got ${actual}`)
for (const name of names) {
  const path = join(directory, name)
  if (!statSync(path).isFile() || statSync(path).size < 1024) throw new Error(`invalid artifact ${name}`)
}
if (prefix(join(directory, names[1]), 2).toString('ascii') !== 'MZ') throw new Error('NSIS executable magic mismatch')
const digests = Object.fromEntries(names.map((name) => [name, hash(join(directory, name))]))
const identity = { schemaVersion: 1, repository: 'Aiden-FE/forge-x', tag, commit, tagObject, runId: String(runId) }
const sums = `${names.map((name) => `${digests[name]}  ${name}`).join('\n')}\n`
if (mode === 'create') {
  writeFileSync(manifestPath, `${JSON.stringify({ ...identity, digests }, null, 2)}\n`)
  writeFileSync(sumsPath, sums)
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  for (const [key, value] of Object.entries(identity)) if (manifest[key] !== value) throw new Error(`candidate ${key} mismatch`)
  if (JSON.stringify(manifest.digests) !== JSON.stringify(digests)) throw new Error('candidate asset hash mismatch')
  if (readFileSync(sumsPath, 'utf8') !== sums) throw new Error('SHA256SUMS mismatch')
}
console.log(`candidate ${mode} verified: ${names.join(', ')}`)
