# PBI-1: Cross-Platform Viewer & Core Ops
[View in Backlog](../backlog.md#user-content-1)

## Overview
Deliver a stable, cross-platform PDF viewer and core operations (annotations, page operations, form fill/flatten) with built-in auto-updates and installers for Windows, macOS, and Linux, using permissive open-source libraries.

## Problem Statement
Users need a reliable desktop app to view and lightly edit PDFs across all major OSes with secure distribution and updates, without GPL/AGPL or commercial licensing constraints.

## User Stories
- Open and render multi-page PDFs with smooth zoom/pan and page thumbnails.
- Create/edit/save annotations (highlights, comments, shapes) stored as proper PDF Annot objects.
- Merge, split, reorder, rotate pages and save incrementally while preserving metadata/outlines.
- Fill common AcroForm fields and optionally flatten them for compatibility.
- Receive signed auto-updates with rollback on failure.
- Install trusted builds on Windows/macOS/Linux (signed/notarized as applicable).

## Technical Approach
- Electron shell: main/renderer split, secure preload bridges, TypeScript, CSP enforced.
- Rendering: PDF.js (pdfjs-dist) for viewer, text layer, selection.
- Core ops: pdf-lib (MIT) for object manipulation; qpdf (Artistic 2.0) for structural operations.
- Forms/annotations: model and UI for proper PDF objects and appearance streams; incremental save.
- Auto-update: electron-updater using signed releases; staged rollout support.
- Packaging: Windows (NSIS/MSI + Authenticode), macOS (.app + DMG, notarized), Linux (AppImage).

## UX/UI Considerations
- Workspace with multi-tab documents, page thumbnails, and a toolbar for common actions.
- Annotation tools with color/thickness presets and an overlay for selection/handles.
- Clear progress dialogs for heavy operations; non-blocking workers; cancel support.

## Acceptance Criteria
- PDFs render correctly; zoom/pan smooth; thumbnails accurate.
- Annotations persist as valid Annot entries with expected appearance when reopened elsewhere.
- Page operations succeed and preserve document integrity and metadata.
- Form fields can be filled and optionally flattened; output opens cleanly in standard readers.
- Auto-updates apply signed releases and support rollback.
- Installers run on Windows/macOS/Linux with appropriate signing/notarization.

## Dependencies
Electron, electron-builder/electron-updater; PDF.js, pdf-lib, qpdf; TypeScript, Node workers.

## Open Questions
- Linux distribution channels (Flatpak/Snap vs AppImage only).
- Update hosting (GitHub Releases vs self-hosted).
- Minimum OS versions and performance baselines.

## Related Tasks
See tasks in [./tasks.md](./tasks.md)
