# Tauri 2 for the desktop application

ForgeX will use Tauri 2 to package the existing Vue/Vite client for Windows and macOS, avoiding a bundled Chromium/Node.js runtime while keeping native capabilities behind Tauri's permission model. This accepts reliance on system WebViews (including Windows WebView2) and their platform differences; release readiness depends on verifying WebView2 deployment and offline WebP WASM behavior in packaged builds on both target operating systems.

## Considered Options

- **Tauri 2 (accepted)**: reuses the current frontend and avoids shipping Chromium/Node.js, with OS WebView consistency and WebView2 deployment as explicit constraints.
- **Electron**: bundles Chromium/Node.js for a more uniform renderer, at the cost of a larger runtime and a broader privileged-process boundary that must be hardened.
