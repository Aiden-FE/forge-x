import { describe, expect, it } from 'vitest'
import config from '../../src-tauri/tauri.conf.json'

describe('desktop custom-provider network policy', () => {
  it('allows HTTP(S) provider requests from the desktop WebView', () => {
    const csp = config.app.security.csp
    const connectSource = csp.match(/connect-src ([^;]+)/)?.[1]

    expect(connectSource).toContain('http:')
    expect(connectSource).toContain('https:')
  })
})
