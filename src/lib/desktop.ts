/**
 * Runtime detection for the Tauri 2 host.
 *
 * The WebP tool's existing `<input type=file>` and `<a download>` flows
 * already surface the OS-native dialogs inside the Tauri WebView2 /
 * WKWebView. This helper exists so future native-menu or dialog calls
 * can guard against running in a plain browser build.
 */

export const isTauri =
  typeof window !== 'undefined' &&
  typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !==
    'undefined'

/**
 * Subscribe to the "go home" menu event emitted by the Rust side
 * (Help → Home accelerator CmdOrCtrl+Shift+H).
 */
export function onNativeNavHome(handler: () => void): () => void {
  if (!isTauri) return () => {}
  let unlisten: (() => void) | null = null
  void import('@tauri-apps/api/event')
    .then(({ listen }) =>
      listen<string>('forgex://nav', (event) => {
        if (event.payload === '/') handler()
      }),
    )
    .then((u) => {
      unlisten = u
    })
  return () => {
    unlisten?.()
  }
}