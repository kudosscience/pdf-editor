# PBI-2: WYSIWYG Text & Image Editing
[View in Backlog](../backlog.md#user-content-2)

## Overview
Enable users to edit text and replace images directly within opened PDFs, with undo/redo support, dirty state tracking, and reliable incremental save. All editing is offline with no cloud dependencies.

## Problem Statement
Users need to make quick corrections to PDF text (typos, updates) and swap embedded images without external tools. The editing experience must be intuitive (select → edit in-place), changes must persist correctly when saved, and the workflow must support undo/redo to prevent accidental destructive edits.

## User Stories
- Select a text object on a PDF page and edit its content in-place.
- Select an image object and replace it with a new image from disk.
- Undo/redo edits before saving.
- See a dirty indicator when unsaved changes exist; get prompted before closing.
- Save edits incrementally; reopen in external viewers to confirm changes persisted.

## Technical Approach
- **Object discovery:** Extend the PDFium addon to expose `listPageObjects` (text/image classification, bounding boxes, transforms) and `editTextObject` / `replaceImageObject` mutation functions.
- **IPC:** Add `pdf:list-objects`, `pdf:edit-text`, `pdf:replace-image` channels with typed payloads.
- **Renderer:** Hit-test canvas clicks against object bounding boxes; show selection overlay with handles; double-click text to open in-place editor; image replace via file picker or drag-drop.
- **Undo/redo:** Maintain a command stack in the renderer; each edit is a serializable command with apply/reverse; Ctrl+Z / Ctrl+Shift+Z shortcuts.
- **Save:** `pdf:save` calls `PdfiumEngine.save()` which serializes via PDFium's `FPDF_SaveAsCopy`; dirty flag cleared on success.
- **Offline:** No network calls; all fonts and resources embedded or system-provided.

## UX/UI Considerations
- Selection overlay with blue outline and resize handles on selected objects.
- In-place text editor: contenteditable overlay positioned over the text object; commit on Enter or blur; cancel on Escape.
- Image replace: file picker filters to PNG/JPEG; drag-drop onto selected image object to replace.
- Toolbar buttons: Select, Edit Text, Replace Image (in addition to existing Open/Save/Zoom).
- Dirty indicator: asterisk in title bar and status bar when unsaved changes exist.

## Acceptance Criteria
- Text edits persist: change text content → save → reopen in Adobe Reader/Chrome → see updated text.
- Image replacements persist: replace image → save → reopen → see new image with correct dimensions.
- Undo/redo reverses and reapplies edits correctly.
- Dirty state tracks accurately; prompt prevents accidental data loss on close.
- No crashes on CJK text, rotated pages, or transparent PNG images.
- Save does not corrupt document structure or inflate file size unreasonably.

## Risks & Mitigations
| Risk | Mitigation |
| :--- | :--------- |
| PDFium text editing limited to glyph replacement (no reflow) | Document limitation clearly; scope to same-length or shorter edits initially |
| Font availability differs across platforms | Use embedded fonts when available; fall back to system fonts with warning |
| Image replacement may not preserve all metadata | Test with transparency, EXIF, color profiles; strip non-essential metadata |
| Undo stack memory for large edits | Cap undo depth; serialize commands efficiently |

## Dependencies
PBI 1 (viewer and engine foundation); PDFium addon with edit functions; typed IPC surface.

## Open Questions
- Maximum undo stack depth (configurable constant?).
- Whether to support multi-object selection in MVP or defer.
- Font substitution strategy when embedded font not available.

## Related Tasks
See tasks in [./tasks.md](./tasks.md)
