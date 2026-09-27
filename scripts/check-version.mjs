import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const tauri = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'))
const cargo = readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8')
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
const version = pkg.version
const tag = process.argv[2] === '--require-tag' ? process.argv[3] : undefined

if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`invalid SemVer: ${version}`)
if (version !== tauri.version || version !== cargoVersion) {
  throw new Error(`version mismatch: package=${version}, tauri=${tauri.version}, cargo=${cargoVersion}`)
}
if (process.argv[2] === '--require-tag' && tag !== `v${version}`) {
  throw new Error(`tag must be v${version}, received ${tag || '<missing>'}`)
}
console.log(`ForgeX version ${version}${tag ? ` (${tag})` : ''}`)
