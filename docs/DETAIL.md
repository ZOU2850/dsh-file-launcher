# File launcher

**A right-Sidebar file launcher for DeepSeek Harness: the files a conversation produced, delivered, read, or received, in one clickable inventory.**

The panel lives in the right sidebar as the **File launcher** tab. It opens from the sidebar guide (the **+** control), from the folder button in the conversation header's right-side utilities, or from the **Files** pill at the left of the composer tool row; the header and composer entries open (or focus) the panel directly.

## What it does

### 1. One inventory per conversation, with strict isolation

- **Conversation** shows only files this conversation produced, explicitly delivered, read, or received as an attachment. Other conversations' files never leak into this list.
- **Sent by me** scans up to 20 recent top-level conversations across every project, one at a time, only on first access. User files and plain-text `@path` references are collected and each row is annotated with its project and conversation title. The result is persisted in `$DSH_HOME/file-launcher/sent-index.json`; startup never prewarms it, avoiding the heap spike that caused a Host OOM.
- **Project** adds the readable documents in the conversation's current workspace (`.docx`, `.pptx`, `.xlsx`, `.pdf`, `.md`, `.txt`, images, HTML, media, archives). Build output, `node_modules`, `.git`, and hidden metadata directories are skipped.
- **Pinned** lists the durable pin manifest.
- **History** drills into another conversation and shows its inventory. Conversations are grouped into collapsible project sections by workspace; the host reads the selected session's log, and the file address keeps the owning session so previews and native opens stay inside that workspace.

Each row carries a source badge: **Delivered** (`present` tool), **Created** (`write`/tool result), **Edited** (`edit`/`apply_patch`), **Read**, **User** (a file the user sent as an attachment or as a plain-text `@path`), **Workspace**, **Pinned**, **Reference** for an `@path` mention, and **Archived** when a copy has been recorded in the archive manifest. Referenced rows also carry `referenceOrigin` (source session, project, message sequence, timestamp, excerpt). Clicking the **Reference** badge or choosing **Trace reference origin** opens that origin card. Filtering is one **Filters** button that opens a **master-detail** panel: **Source** on the left is the parent (Delivered, User, Created, Read, Workspace…); **Type** on the right is nested under the selected source. Parent counts stay stable; child counts are computed within that source, search, and archived state. Selecting a different parent resets the child to “all types”; selecting a type closes the panel. Selected filters appear as removable tags; **Clear all** resets them.

**Sent by me** and **Project** group their rows into collapsible **Project → Conversation** sections. **Sent by me** can start collapsed (configurable in Settings) while **Project** flattens/expands the single workspace header automatically so workspace files are immediately reachable. Search or any active filter forces the matching groups open. Workspace-only rows use a **Workspace files** session under the current project. Filters apply to the files inside each group, and group/session counts update from the filtered set.

### 2. Preview and native opening

- Row actions are always visible: a preview arrow and a labeled **Open with** menu button. Right-clicking a row opens a floating, scrollable menu at the pointer; the same menu includes detected apps, copy path/reference/image, pin, archive, and **Delete file**.
- Clicking an image (or **Preview here**) opens the plugin preview with **previous/next** controls and the arrow keys; the counter and `Esc` close are always shown. Right-clicking inside the image preview opens the same action menu, including **Copy image**.
- PDF and Office documents are rendered as **page images** by the Host (`pdfinfo` + `pdftoppm`). Ordinary PDFs render straight from their resolved Host path when available (falling back to workspace byte reads), avoiding unnecessary base64 round-trips. The plugin supplies its own persistent toolbar (previous/next page, page count, zoom, fit width, open sidebar, close); clicking outside the preview does not close it; right-clicking the page opens the file action menu. Office documents are converted by the optional `office-kit` service to PDF first. If local PDF rendering is unavailable, the error state offers **Open in sidebar**.
- **Live refresh.** While the panel is open, the active scope polls every **60 seconds** by default (5–300 s or off in Settings), reusing short-lived Host scan caches while explicit **Refresh** passes `fresh=1`. Sent also merges the current session and updates quietly while preserving selection.
- **Missing files are ghosts.** A user `@path` or delivered file that no longer exists is retained as a **Missing** row with its last path; opening it shows a notice. Files deleted through the plugin are recorded in `$DSH_HOME/file-launcher/deleted.json` and suppressed from ghosts. A moved file is relinked with a **Moved** badge when the same name/size appears in the refreshed Sent session; a cross-drive move without a new reference stays Missing.
- **Delete file** asks for an explicit confirmation, then permanently unlinks the source file, records a deletion tombstone, and removes its pin and archive-manifest entry. Attachments get an extra warning because deleting the stored object can break historical references.
- **Open with** detects the file's current desktop associations through the Host and lists them (Word/WPS, Excel, PowerPoint, VS Code, browsers, and so on). Choose one to launch it, or use **Show in file manager** to reveal the original file.
- On Windows, **Choose an app…** opens the system *Open with* dialog (`OpenAs_RunDLL`).
- Native actions require a Host desktop; the panel still previews and copies paths without one.

### 3. Composer attachments & references

Select rows and choose **Insert reference / Attach**: when the host provides the optional `fileDrag` capability and an active composer drop target, the launcher attaches the actual files; otherwise it falls back smoothly to inserting removable `@relative/path` references at the caret (or copying to the clipboard if no composer is mounted).

### 4. Pins that survive context compaction

**Pin** writes the file path into `$DSH_HOME/file-launcher/pins.json` (atomic rename). A pin protects the **path memory**, not the bytes: the file stays on disk, is never moved, and is never deleted by pinning, archiving, or context compaction. Compaction only reduces conversation memory; it does not touch the filesystem. The agent tool can recover pinned paths after compaction:

```text
file_launcher({ action: "list", scope: "pinned" })
```

### 5. Archive

**Archive** copies selected files into a dated folder and leaves the original in place:

1. `$DSH_FILE_LAUNCHER_ARCHIVE_DIR` when set;
2. the user's configured `archiveDir` in Settings (`settings.json`) when set;
3. otherwise `~/Documents/DeepSeekHarnessFileLauncher/Archived_Docs`.

Name collisions gain a numeric suffix. Every successful copy is recorded in `$DSH_HOME/file-launcher/archive.json`, which drives the **Archived** badge and the **Archived** filter; the source path remains the authoritative file and is never moved or removed by the plugin.

## Agent tool

The bundle registers one tool, `file_launcher`:

| Action | Meaning |
|---|---|
| `list` | List files for the current conversation (`scope: "session"`), user-attached files across recent projects and conversations (`"sent"`), the conversation plus workspace documents (`"project"`), or the pin manifest (`"pinned"`). |
| `sessions` | List recent top-level conversations with their workspace. |
| `pin` / `unpin` | Add or remove paths in the durable pin manifest. |
| `archive` | Copy paths into the archive folder. |

The tool returns paths and compact facts, never file contents.

## Host routes

The panel talks to authenticated Fetch routes registered through Connection's exact-route registry, so the browser cookie and Host/Origin fence apply before any handler:

- `GET /api/file-launcher.inventory`
- `GET|POST /api/file-launcher.pins`
- `POST /api/file-launcher.archive`
- `POST /api/file-launcher.delete` (requires `confirm: true`)
- `POST /api/file-launcher.forget`
- `POST /api/file-launcher.open-folder`
- `POST /api/file-launcher.pdf-pages`
- `GET /api/file-launcher.pdf-image`
- `POST /api/file-launcher.open-as`
- `GET|POST /api/file-launcher.settings`
- `GET /api/file-launcher.health`
- `GET /api/file-launcher.sessions`

## Settings

The browser registers a `settings.section` page with id `file-launcher.settings` through the public Settings slot. It edits `$DSH_HOME/file-launcher/settings.json` through `GET|POST /api/file-launcher.settings`; the Host bounds every field (refresh 5–300 s, PDF pages 1–40, DPI 80–160, rows 100–2000, optional `archiveDir`). Appearance is intentionally limited to theme (`host`, `light`, `dark`, `system`): when set to `light` or `dark` (or resolved `system`), a scoped palette overrides the DSH alias tokens while `host` preserves DSH's native CSS tokens untouched. Upon save, the theme is mirrored to `localStorage` and a local event updates an already-open Sidebar immediately. The section is independent of `cordis.patch.yml`, so a plugin reinstall or update does not overwrite the user's preferences.

## Compatibility and resources

- Tested against DSH Desktop `0.2.2-rc.3` (Electron 44.7, Node 24.21), using only public Host and Client extension points. The bundle imports no `@deepseek-ai/dsh-*` package and treats `officeKit` and `fileDrag` as optional capabilities without blocking plugin activation.
- The Settings page registers lazily through the public `settings.section` slot; on an older DSH without that slot the page is absent but the launcher still loads. A future DSH change there is the only known contract to re-check when upgrading.
- Auto-refresh defaults to 60 seconds and uses `AbortController`; stale inventory requests are cancelled rather than queued.
- The panel and auto-refresh make no LLM calls, so they consume no model tokens. Only an explicit `file_launcher` tool result enters context (60 rows by default).
- Persisted artifacts (`pins.json`, `sent-index.json`, `archive.json`, `settings.json`, `deleted.json`) are written atomically via serialized write queues under `$DSH_HOME/file-launcher/`, and `previews/` is automatically pruned to at most 120 files.

## Known limitations

- **Session log vocabulary.** Inventory is derived from the durable Session log (`tool/call`, `tool/result`, `deliverables/presented`, `user/message`). A file created only by a shell command and never named in a tool result or `present` call appears under **Project** only after it becomes a readable workspace document; it is not attributed to the conversation.
- **One working directory.** Workspace scans are rooted at the Session's current working directory; the panel cannot browse above it. **Project** lists files inside that root (plus explicit deliveries), so reads from elsewhere belong only to the conversation scope.
- **Office preview fidelity.** Previewers render the shipped DSH previews; complex Office layout still belongs in the native application.
- **Native actions need a Host desktop.** The Host reports availability through `session.canOpenWorkspacePath`; without it the menu keeps preview and copy actions only. Application choices come from the Host's `session.workspacePathApplications` catalog, so a file type with no registered association offers reveal, the system *Open with* dialog, and copy actions only.
- **Office preview depends on office-kit.** Word/PowerPoint/Excel in-panel previews use the Host's `office-kit` conversion to PDF; a profile without that provider keeps the Sidebar preview fallback.
- **PDF rendering needs local PDF tools.** Page previews use `pdfinfo` and `pdftoppm` from the Host PATH. If they are unavailable, the preview shows an error with **Open in sidebar**.
- **Ghost rows cover user/@ and delivered files.** A workspace-only file that is deleted outside the plugin and never referenced by the conversation has no historical path to keep. Cross-drive moves with no new reference keep the old ghost.
- **Live refresh is 60 seconds by default**, adjustable (5–300 s) or disableable in Settings; it is not a filesystem watcher, so a just-created file appears on the next tick or after clicking **Refresh**.
- **Sent by me is bounded.** It scans up to 20 recent top-level conversations, one at a time, and only on first access. The index is persisted and never prewarmed; startup prewarming was removed after it caused a Host heap OOM.
- **References & attachments:** **Insert reference / Attach** inserts removable plain-text `@path` through the composer's `InputActions` (retrying once and falling back to a DOM insertion); it never silently switches to a file-drop card. Copying remains the last resort.
- **@ references are parsed as User entries.** A plain-text `@C:\…` or quoted `@"C:\path with spaces"` path in a user message is resolved through the Host. A file appears under **User** / **Sent by me** with a **Reference** badge and origin metadata; a folder appears as a folder row with **Open in Explorer**; a missing user file is retained as a **Missing** ghost. Special extensions are auto-classified (application, design, database, font, disk image, binary, folder, other).
- **Delete is permanent.** It asks first, but the unlink cannot be undone; archive and pin never delete files.
- **Image previews read the source object.** Normalized image attachments have no file extension, so the Host publishes an extension-bearing hard link (or copy) under `$DSH_HOME/file-launcher/previews`; the original attachment object remains the file of record.
- **Pins are host-global.** They are not synced between machines and are not part of the Session export.
- **Archive copies are plain files.** No checksums or version history are kept; the original is never moved or deleted.

## Verification

Verified on DeepSeek Harness `0.2.2-rc.3`, Windows desktop, against the running profile:

- The bundle installed and enabled through the plugin manager; its row shows the localized title, description, and icon.
- The right Sidebar guide renders the **File launcher** card and opens the panel; the folder button in the conversation header's utilities and the **Files** pill at the composer's left edge also open (or focus) the panel directly.
- Conversation, Sent by me, Project, Pinned, and History scopes work; History groups conversations by project and each project section collapses.
- **Sent by me** collects user attachments and plain-text `@path` references across projects and conversations and serves cached entries from the persisted index.
- Search, the **Filters** panel, archived toggle, and sort re-filter the list. **Source** is the parent; selecting **User** narrowed the child Type column to the types inside User. Parent Source counts stayed stable while child Type counts updated.
- **Sent by me** and **Project** render rows under **Project → Conversation** groups; workspace-only rows use a **Workspace files** session, while single-project **Project** views flatten redundant outer headings. Group and session counts follow the active filters.
- A user `@folder` path produced a folder row (self-test), and the special-extension categories were covered by the inventory self-test.
- **History** shows a header `←` back button after drilling into a conversation.
- PDF/Office pages are rendered as images with a persistent toolbar (previous/next, page count, zoom, fit width, open sidebar, close). Right-clicking the page opens the action menu; clicking outside the preview does not close it.
- **Live refresh:** background polling honors abort signals and preserves selected rows without clobbering switching state.
- **Settings:** `readSettings()`/`writeSettings()` are covered by the self-test; values are clamped (refresh 5–300 s, pages 1–40, DPI 80–160, rows 100–2000) and persisted under the isolated test home, including custom `archiveDir`.
- **Missing rows:** the inventory self-test covers a user `@path` whose file no longer exists; it is retained with `missing: true`. Plugin deletion records a tombstone so it does not return as a ghost.
- **PPTX & PDF:** plain-text `@path` documents are resolved under **User**, rendered directly by path (PDF) or converted via optional `office-kit` (Office) when present, and displayed in the page/zoom toolbar.
- Row actions are visible without hover; right-clicking a row opens a **floating, scrollable** menu at the pointer with preview, native open, copy, pin, archive, and delete.
- **Delete file** showed a confirmation card and permanently removes a file from disk after explicit confirmation while suppressing future ghosts via tombstone and cleaning up preview links.
- **Pin** wrote `$DSH_HOME/file-launcher/pins.json` with an atomic manifest; the Pinned scope and the `file_launcher` tool both read it.
- **Insert reference / Attach** inserts `@relative/path` text into the composer through InputActions (with a DOM fallback) and never silently becomes a copy-only action.
- **Archive** copies files into a dated subfolder under the configured archive root and attaches an **Archived** badge and filter without moving or deleting originals.
- The `file_launcher` tool returned a compact inventory, listed pinned paths, and removed a pin.
- The native application list was not launched during verification; the menu's availability depends on the Host's desktop associations.

