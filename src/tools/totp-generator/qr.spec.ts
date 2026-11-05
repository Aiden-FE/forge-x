import { describe, expect, it } from 'vitest'
import qrcode from 'qrcode-generator'
import { buildOtpauthUri } from './totp'
import { generateOtpauthQr, otpauthQrSvg } from './qr'

const ENTRY = {
  issuer: 'GitHub',
  account: 'me@example.com',
  secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  algorithm: 'SHA1' as const,
  digits: 6,
  period: 30,
}

describe('otpauth QR 生成（点击显示才渲染的底层供给）', () => {
  it('非空 URI 产出 SVG 字符串；空输入返回 null（UI 空态）', async () => {
    const svg = await otpauthQrSvg(buildOtpauthUri(ENTRY))
    expect(svg).not.toBeNull()
    expect(svg!.startsWith('<svg')).toBe(true)
    expect(svg!.endsWith('</svg>')).toBe(true)
    await expect(otpauthQrSvg('')).resolves.toBeNull()
  })

  it('QR 内容 = otpauth URI：矩阵与 qrcode-generator 对同一 URI 的直接编码逐模块一致', async () => {
    const uri = buildOtpauthUri(ENTRY)
    const qr = await generateOtpauthQr(uri)
    expect(qr).not.toBeNull()
    if (!qr) return

    // 独立侧：直接用 npm 库按同参数编码同一 URI（不经我们的封装）
    const lib = qrcode(0, 'M')
    lib.addData(uri)
    lib.make()

    expect(qr.moduleCount).toBe(lib.getModuleCount())
    let identical = true
    outer: for (let row = 0; row < lib.getModuleCount(); row++) {
      for (let col = 0; col < lib.getModuleCount(); col++) {
        if (qr.isDark(row, col) !== lib.isDark(row, col)) {
          identical = false
          break outer
        }
      }
    }
    expect(identical).toBe(true)
  })

  it('HOTP 条目 URI（otpauth://hotp/…counter=…）同样可编码，且与 TOTP URI 矩阵不同', async () => {
    const hotpUri = buildOtpauthUri({ ...ENTRY, type: 'hotp', counter: 41 })
    expect(hotpUri.startsWith('otpauth://hotp/')).toBe(true)
    const hotpQr = await otpauthQrSvg(hotpUri)
    const totpQr = await otpauthQrSvg(buildOtpauthUri(ENTRY))
    expect(hotpQr).not.toBeNull()
    expect(hotpQr).not.toBe(totpQr) // 内容不同 → 矩阵不同（确定性编码）
  })

  it('确定性：同一 URI 两次生成逐字节一致', async () => {
    const uri = buildOtpauthUri(ENTRY)
    await expect(otpauthQrSvg(uri)).resolves.toBe(await otpauthQrSvg(uri))
  })
})

// 说明：真实「相机解码 → 对照 URI」验证留在 e2e/手动（本仓库 vitest 层无解码器依赖，
// 且票据锁定 0 新依赖；上例试题以同库直接编码等价性为最强可得断言）。
