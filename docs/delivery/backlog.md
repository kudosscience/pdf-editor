# Product Backlog — PDF Editor

| ID | Actor | User Story | Status | Conditions of Satisfaction (CoS) |
| :-- | :---- | :--------- | :----- | :------------------------------- |
| 1 | User | As a user, I want a stable cross-platform PDF viewer powered by PDFium so I can open, render, navigate, and save PDFs on Windows, macOS, and Linux. | InProgress | [View Details](./1/prd.md) |
| 2 | User | As a user, I want to edit text and replace images in-place with undo/redo so I can make WYSIWYG changes to PDF content offline. | Agreed | [View Details](./2/prd.md) |
| 3 | User | As a user, I want advanced PDF tools (annotations, redaction, OCR, signatures) so I can securely modify, search, and sign documents. | Agreed | [View Details](./3/prd.md) |
| 4 | User | As a user, I want a secure, well-packaged app with MSI/DMG/AppImage installers so I can install and use it safely across OSes. | Agreed | [View Details](./4/prd.md) |
| 5 | User | As a user, I want a polished, accessible UX so I can work efficiently and inclusively. | Agreed | [View Details](./5/prd.md) |

## PBI History

| Timestamp | PBI_ID | Event_Type | Details | User |
| :-------- | :----- | :--------- | :------ | :--- |
| 20260218-120000 | 1 | create_pbi | PBI created | User |
| 20260218-120000 | 2 | create_pbi | PBI created | User |
| 20260218-120000 | 3 | create_pbi | PBI created | User |
| 20260218-120000 | 4 | create_pbi | PBI created | User |
| 20260218-120000 | 5 | create_pbi | PBI created | User |
| 20260218-120100 | 1 | propose_for_backlog | Marked as Agreed per user request | User |
| 20260218-120100 | 2 | propose_for_backlog | Marked as Agreed per user request | User |
| 20260218-120100 | 3 | propose_for_backlog | Marked as Agreed per user request | User |
| 20260218-120100 | 4 | propose_for_backlog | Marked as Agreed per user request | User |
| 20260218-120100 | 5 | propose_for_backlog | Marked as Agreed per user request | User |
| 20260218-161000 | 1 | start_implementation | Started implementation — Task 1-1 InProgress | User |
| 20260218-180000 | 1 | significant_update | Engine changed from PDF.js to PDFium (native N-API addon); scope narrowed to viewer foundation; annotations/forms/auto-update deferred to later PBIs | User |
| 20260218-180000 | 2 | significant_update | Scope focused on text editing and image replacement (MVP); offline-only constraint added | User |
| 20260218-180000 | 4 | significant_update | Packaging targets changed to MSI (WiX), notarized DMG, AppImage; auto-update deferred | User |
