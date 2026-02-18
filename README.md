# PDF Editor

Cross-platform desktop PDF editor with WYSIWYG text and image editing.  
Built with **Electron**, **PDFium** (native N-API addon), and **TypeScript** — fully offline, no cloud dependencies.

## Quick Start

```bash
npm install
npm start
```

Development mode (DevTools open):
```bash
npm run dev
```

## Build

```bash
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

## Architecture

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

### PDFium Engine

The rendering and editing engine is **PDFium** (Chromium's PDF library), exposed to Node.js via a native N-API addon. The `PdfiumEngine` TypeScript façade manages document handles, validates inputs, normalises errors, and provides typed async methods.

Key features:
- **Canvas rendering:** Pages rendered to RGBA bitmaps via `FPDF_RenderPageBitmap`
- **LRU bitmap cache:** Bounded by `MAX_BITMAP_CACHE_BYTES` (256 MB default)
- **Render queue:** Concurrent renders limited by `RENDER_CONCURRENCY_LIMIT`
- **Object inspection:** `listPageObjects` returns text/image bounding boxes
- **Text editing:** `editTextObject` modifies glyph content via PDFium edit API
- **Image replacement:** `replaceImageObject` swaps embedded images (PNG/JPEG)
- **Save:** `FPDF_SaveAsCopy` serialisation with dirty-state tracking

### Security Model

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

## License

MIT
