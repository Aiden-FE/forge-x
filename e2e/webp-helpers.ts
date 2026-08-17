/**
 * WebP 转换器 e2e 共享工具：fixture 定位、统一上传（buffer 化）、行状态定位、WebP 魔数断言。
 * 供 webp-converter.spec.ts 与 webp-converter-webkit.spec.ts 复用，避免复制粘贴。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, type Page } from '@playwright/test'

export const fixture = (name: string) => path.resolve(process.cwd(), 'e2e', 'fixtures', name)

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

export type UploadPayload = string | { name: string; mimeType: string; buffer: Buffer }

export async function openTool(page: Page) {
  await page.goto('/#/tool/webp-converter')
  await page.waitForSelector('[data-test="dropzone"]')
}

export async function upload(page: Page, files: UploadPayload[]) {
  // Playwright 不允许同一次 setInputFiles 混用路径与 buffer，统一读成 buffer
  const payloads = files.map((f) =>
    typeof f === 'string'
      ? {
          name: path.basename(f),
          mimeType: MIME_BY_EXT[path.extname(f)] ?? 'application/octet-stream',
          buffer: readFileSync(f),
        }
      : f,
  )
  await page.locator('[data-test="file-input"]').setInputFiles(payloads as never[])
}

export const rowByStatus = (page: Page, status: string) =>
  page.locator(`[data-test="row"][data-status="${status}"]`)

/** 断言 RIFF/WEBP 魔数（有效 WebP 容器的最小判据）。 */
export function expectWebpMagic(buf: Uint8Array | Buffer) {
  expect(Buffer.from(buf.buffer, buf.byteOffset, 4).toString('ascii')).toBe('RIFF')
  expect(Buffer.from(buf.buffer, buf.byteOffset + 8, 4).toString('ascii')).toBe('WEBP')
}
