# PBI-1: Cross-Platform PDFium Viewer & Engine Foundation
[View in Backlog](../backlog.md#user-content-1)

## Overview
Deliver a stable, cross-platform PDF viewer powered by PDFium via a native N-API addon, with a TypeScript façade in the main process, typed IPC, and a canvas-based renderer. This PBI establishes the rendering engine, document lifecycle, and viewer UI foundation that subsequent PBIs (editing, advanced tools, packaging) build upon.

## Problem Statement
Users need a reliable, offline-capable desktop PDF viewer that renders faithfully across Windows, macOS, and Linux. The rendering engine must also expose object-level access (text, images) so that later PBIs can implement editing without re-architecting the core.

## User Stories
- Open and render multi-page PDFs with smooth zoom/pan and page thumbnails.
- Navigate pages via sidebar thumbnails and keyboard shortcuts.
- Drag-and-drop PDF files onto the viewer to open them.
- Save documents (preserving structure) and track recent files.
- Experience low memory usage via LRU bitmap caching and render cancellation on rapid navigation.

## Technical Approach
- **Engine:** PDFium via a native N-API addon (`native/pdfium`) providing `openDocument`, `closeDocument`, `getPageCount`, `renderPage`, `listPageObjects`, and `saveDocument`. Prebuilt per OS/arch; included via `asarUnpack`.
- **Façade:** TypeScript wrapper `PdfiumEngine` in `src/main/pdfium.ts` with strong types, lifecycle management, and normalized `{code, message}` errors.
- **IPC:** Extend `src/shared/ipc-schema.ts` with `pdf:open`, `pdf:close`, `pdf:get-page-count`, `pdf:render-page`, `pdf:list-objects`, `pdf:save` channels and typed payloads/results. Wire handlers in `src/main/ipc-handlers.ts`; expose `window.api.pdf.*` in `src/preload/index.ts`.
- **Renderer:** Canvas-based viewer in `src/renderer/app.ts` with zoom/pan, page navigation, thumbnail sidebar, and drag-drop open. Status bar shows page number, zoom level, and document state.
- **Performance:** LRU bitmap cache bounded by `MAX_BITMAP_BYTES`; concurrent render limit via `RENDER_CONCURRENCY_LIMIT`; cancellation of in-flight renders on rapid navigation.
- **Security:** Maintain `contextIsolation`, sandbox, IPC allow-list, CSP. No network calls (offline-only).

## UX/UI Considerations
- Dark theme workspace with toolbar, thumbnail sidebar, canvas stage, properties panel placeholder, and status bar.
- Smooth zoom/pan; responsive thumbnails; clear loading/error states.
- Drag-drop overlay; keyboard shortcuts (Ctrl+O open, +/- zoom, PgUp/PgDn navigate).

## Acceptance Criteria
- PDFs render correctly at various zoom levels; zoom/pan smooth to ≥200%.
- Thumbnails display all pages and navigate on click.
- Drag-drop opens PDFs; file dialog opens PDFs; recent files tracked.
- Save writes valid PDF; reopen shows identical content.
- Memory stays within cache limits; no leaks across document open/close cycles.
- No network calls observed during normal usage (offline-only).
- Security settings intact: contextIsolation, sandbox, CSP, IPC allow-list.

## Risks & Mitigations
| Risk | Mitigation |
| :--- | :--------- |
| Native addon build complexity per OS/arch | Use prebuildify with CI matrix; fallback to runtime compile |
| PDFium binary size (~20 MB per platform) | Accept for desktop app; compress in installer |
| Font rendering differences across platforms | Test with CJK, RTL, and symbol PDFs in fixtures |
| Large PDF memory usage | LRU cache with `MAX_BITMAP_BYTES` cap; tile rendering for future optimization |

## Dependencies
Electron, node-addon-api, PDFium (prebuilt), TypeScript.

## Open Questions
- Exact PDFium version and source (chromium/pdfium vs pdfium-lib prebuilds).
- Tile-based rendering for very large pages (deferred to optimization pass).
- Worker thread vs main-thread addon calls (benchmark to decide).

## Related Tasks
See tasks in [./tasks.md](./tasks.md)
