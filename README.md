# PDF Editor

Cross-platform desktop PDF editor with WYSIWYG editing capabilities.  
Built with **Electron**, **PDF.js**, **pdf-lib**, and **qpdf** — all permissive open-source licenses.

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

# Package for current OS
npm run pack

# Create distributable installer
npm run dist
```

## Architecture

```
src/
├── main/         # Electron main process
│   ├── index.ts        # App lifecycle, window creation, CSP enforcement
│   └── ipc-handlers.ts # IPC handler registration (typed, validated)
├── preload/      # Preload bridge (contextBridge → window.api)
│   └── index.ts
├── renderer/     # UI (no Node/Electron access)
│   ├── index.html
│   ├── styles.css
│   └── app.ts
└── shared/       # Types, constants, IPC schema shared across processes
    ├── constants.ts
    └── ipc-schema.ts
```

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

## License

MIT
