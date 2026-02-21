# PDF Editor

Cross-platform desktop PDF editor with WYSIWYG text and image editing.  
Fully offline — no cloud, no subscriptions, no account required.

---

## Download

Pick the installer for your operating system:

| Operating System | Download | Notes |
|:---:|:---:|:---|
| **Windows** | [**Download for Windows**](https://github.com/kudosscience/pdf-editor/releases/latest/download/PDF.Editor.Setup.0.1.0.exe) | Run the `.exe` installer and follow the prompts |
| **macOS (Apple Silicon)** | [**Download for Mac (M1/M2/M3)**](https://github.com/kudosscience/pdf-editor/releases/latest/download/PDF.Editor-0.1.0-arm64.dmg) | Open the `.dmg`, drag PDF Editor to Applications |
| **macOS (Intel)** | [**Download for Mac (Intel)**](https://github.com/kudosscience/pdf-editor/releases/latest/download/PDF.Editor-0.1.0.dmg) | Open the `.dmg`, drag PDF Editor to Applications |
| **Linux** | [**Download for Linux**](https://github.com/kudosscience/pdf-editor/releases/latest/download/PDF.Editor-0.1.0.AppImage) | Make executable: `chmod +x *.AppImage`, then run |

> **Not sure which Mac you have?** Click the Apple menu () → **About This Mac**. If the chip says "Apple M1" / "M2" / "M3" etc., choose **Apple Silicon**. Otherwise choose **Intel**.

All downloads are also available on the [Releases page](https://github.com/kudosscience/pdf-editor/releases).

---

## Features

- **Edit text** directly on the PDF — double-click any text to modify it
- **Replace images** — swap embedded images with your own PNG or JPEG files
- **Undo / Redo** — full edit history with Ctrl+Z / Ctrl+Shift+Z
- **Multi-page** — navigate, zoom, and edit any page
- **Save & Save As** — Ctrl+S overwrites; Ctrl+Shift+S saves a copy
- **Thumbnails** — sidebar page previews for quick navigation
- **100% offline** — no internet connection needed, your files never leave your computer
- **Open source** — MIT licensed

---

## For Developers

Built with **Electron**, **PDFium** (native N-API addon), and **TypeScript**.

### Quick Start

```bash
npm install
npm start
```

Development mode (DevTools open):
```bash
npm run dev
```

### Build
# Compile TypeScript only
npm run build

# Build native PDFium addon (requires node-gyp and PDFium headers)
npm run build:native

# Package for current OS
npm run pack

# Create distributable installer
npm run dist
```

### Packaging Targets

| Platform | Format | Notes |
|----------|--------|-------|
| Windows  | MSI (WiX) + NSIS | `electron-wix-msi` for enterprise deployment |
| macOS    | DMG | Hardened runtime, notarised |
| Linux    | AppImage | Universal, no-install |

### Architecture

```
src/
├── main/           # Electron main process
│   ├── index.ts          # App lifecycle, window creation, CSP enforcement
│   ├── ipc-handlers.ts   # IPC handler registration (typed, validated)
│   └── pdfium.ts         # PdfiumEngine façade (wraps native addon)
├── preload/        # Preload bridge (contextBridge → window.api)
│   └── index.ts
├── renderer/       # UI (no Node/Electron access)
│   ├── index.html        # Document shell with toolbar, canvas viewer
│   ├── styles.css         # Dark theme, canvas, overlays
│   └── app.ts            # Viewer, zoom/pan, editing, undo/redo
├── shared/         # Types, constants, IPC schema shared across processes
│   ├── constants.ts
│   └── ipc-schema.ts
native/
└── pdfium/         # C++ N-API addon wrapping PDFium (Task 1-2)
    ├── binding.gyp
    └── src/
```

#### PDFium Engine

The rendering and editing engine is **PDFium** (Chromium's PDF library), exposed to Node.js via a native N-API addon. The `PdfiumEngine` TypeScript façade manages document handles, validates inputs, normalises errors, and provides typed async methods.

Key features:
- **Canvas rendering:** Pages rendered to RGBA bitmaps via `FPDF_RenderPageBitmap`
- **LRU bitmap cache:** Bounded by `MAX_BITMAP_CACHE_BYTES` (256 MB default)
- **Render queue:** Concurrent renders limited by `RENDER_CONCURRENCY_LIMIT`
- **Object inspection:** `listPageObjects` returns text/image bounding boxes
- **Text editing:** `editTextObject` modifies glyph content via PDFium edit API
- **Image replacement:** `replaceImageObject` swaps embedded images (PNG/JPEG)
- **Save:** `FPDF_SaveAsCopy` serialisation with dirty-state tracking

#### Security Model

| Layer               | Protection                                       |
|---------------------|--------------------------------------------------|
| `nodeIntegration`   | **Disabled** — renderer has no Node access        |
| `contextIsolation`  | **Enabled** — preload runs in isolated context    |
| `sandbox`           | **Enabled** — OS-level renderer sandboxing        |
| CSP                 | Enforced via response headers and meta tag        |
| IPC                 | Typed schema; channel allow-list; unknown rejected|
| Navigation          | Blocked; `window.open` denied                     |
| Single instance     | Second launch focuses existing window             |
| Offline             | No network calls; auto-update disabled by default |

### Packaging & Distribution

#### Build Installers

```bash
# Build for current platform
npm run dist

# Build for specific platform
npm run dist:win     # Windows NSIS installer
npm run dist:mac     # macOS DMG
npm run dist:linux   # Linux AppImage
```

Installers are written to the `release/` directory.

#### Windows MSI (Enterprise)

For enterprise environments requiring MSI packages:

```bash
# 1. Build unpacked app first
npm run pack

# 2. Compile MSI (requires WiX Toolset v3)
npm run build:msi
```

**Prerequisites:** Install [WiX Toolset v3](https://wixtoolset.org/docs/wix3/) and ensure the `WIX` environment variable is set or WiX `bin/` is on PATH.

#### Native Addon in Packaged Builds

The native PDFium addon (`pdfium.node` + shared library) is automatically extracted from the asar archive via `asarUnpack`. The addon loader in `src/main/pdfium.ts` detects packaged mode (`app.isPackaged`) and resolves the path to `app.asar.unpacked/native/pdfium/build/Release/`.

#### Code Signing & Notarization

##### Windows (Authenticode)

Set the following environment variables before running `npm run dist:win`:

| Variable | Description |
|----------|-------------|
| `CSC_LINK` | Path to `.pfx` certificate file (or base64-encoded) |
| `CSC_KEY_PASSWORD` | Certificate password |
| `WIN_CSC_LINK` | *(optional)* Override for Windows-specific cert |

electron-builder will sign the EXE automatically when these are set.

##### macOS (Apple Notarization)

Set the following environment variables:

| Variable | Description |
|----------|-------------|
| `CSC_LINK` | Path to `.p12` Developer ID certificate (or base64) |
| `CSC_KEY_PASSWORD` | Certificate password |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password (generate at appleid.apple.com) |
| `APPLE_TEAM_ID` | 10-character Team ID from developer.apple.com |

The build uses `build/entitlements.mac.plist` which grants:
- `com.apple.security.cs.allow-jit` — required by V8/Chromium
- `com.apple.security.cs.allow-unsigned-executable-memory` — required by Electron
- `com.apple.security.cs.disable-library-validation` — required for the prebuilt PDFium shared library

##### Linux

No code signing is typically required for AppImage distribution. For package managers (deb, rpm), GPG signing can be configured separately.

#### CI/CD Notes

- Store signing certificates as **encrypted secrets** in your CI system (GitHub Actions, Azure DevOps, etc.)
- Never commit `.pfx`, `.p12`, or password files to the repository
- The `publish` field in `package.json` is set to `null` (auto-update disabled). Set it to a GitHub/S3/generic provider when ready to enable auto-updates.

## License

MIT
