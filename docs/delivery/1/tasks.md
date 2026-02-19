# Tasks for PBI 1: Cross-Platform PDFium Viewer & Engine Foundation
This document lists all tasks associated with PBI 1.
**Parent PBI**: [PBI 1: Cross-Platform PDFium Viewer & Engine Foundation](./prd.md)

## Task Summary
| Task ID | Name | Status | Description |
| :------ | :--- | :----- | :---------- |
| 1-1 | [App shell and secure IPC](./1-1.md) | Done | Electron main/renderer, preload bridges, TypeScript, CSP. |
| 1-2 | [Native PDFium addon](./1-2.md) | Done | N-API addon exposing open/close, pageCount, render, listObjects, save. |
| 1-3 | [TypeScript façade and error normalization](./1-3.md) | Done | PdfiumEngine wrapper with strong types, lifecycle, normalized errors. |
| 1-4 | [IPC and rendering pipeline](./1-4.md) | Done | IPC handlers for pdf:open/close/render/save; LRU cache; concurrency caps. |
| 1-5 | [Canvas viewer UI](./1-5.md) | Done | Zoom/pan, page navigation, thumbnail sidebar, drag-drop open, status bar. |
| 1-6 | [Packaging and signing per OS](./1-6.md) | Done | Windows MSI (WiX), macOS notarized DMG, Linux AppImage. |
| 1-7 | [E2E CoS Test for PBI 1](./1-7.md) | Done | Viewer E2E tests with curated PDF fixtures; offline verification. |
| 1-8 | [Fix scroll offset when canvas exceeds viewport](./1-8.md) | Review | Bug: PDF top clipped when zoomed beyond viewport due to absolute centering. |
