# Icons

Tauri requires platform-specific icon files for bundling. The real PNG/ICO/ICNS assets must be generated from the existing `public/favicon.svg` (or a higher-resolution raster) before producing a release.

Until real icons are produced, `tauri dev` will still work (Tauri falls back to the default Tauri icon), but `tauri build` will refuse to bundle without the listed files. To regenerate them locally run:

```
pnpm tauri icon path/to/source-1024x1024.png
```

The build targets in `tauri.conf.json` expect:

- `32x32.png`, `128x128.png`, `128x128@2x.png` — Windows / Linux
- `icon.ico` — Windows installer
- `icon.icns` — macOS DMG