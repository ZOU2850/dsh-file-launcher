# dsh-file-launcher

[中文说明](README.zh.md)

A **File launcher** tab for the DeepSeek Harness right Sidebar. It answers one question in one place: *which files did this conversation produce, deliver, read, or receive — and what can I do with them?*

## Features

- **Conversation, Sent by me, project, pinned, and history scopes**. **Sent by me** scans recent top-level conversations across every project and labels each file with its project and conversation; history is grouped into collapsible project sections.
- **Durable Session-log inventory**: `present` deliveries, `write`/`edit`/`apply_patch` results, read paths, user files, and normalized user images.
- **Workspace document scan** (Word, PowerPoint, Excel, PDF, Markdown, text, images, HTML, media, archives) with build-output filtering.
- **One Filters control** opens a master-detail panel: **Source** on the left is the parent (Delivered, User, Created, Read, Workspace…); **Type** on the right is nested under the selected source. Parent counts stay stable; child counts are computed inside the parent and also react to search and archived state. Active filters appear as removable tags; one **Clear all** action resets them.
- **Sent by me and Project are grouped Project → Conversation** with collapsible headers. **Sent by me** starts **collapsed** (configurable in Settings) so the panel opens on the project index; **Project** automatically expands when only the current workspace is present so files are visible without redundant clicks. Search or any active filter opens the groups automatically; filters apply inside each group and group counts update.
- **Sent @paths are resolved**: a file path becomes a User file; a folder path becomes a folder row with an **Open in Explorer** action; unknown/special extensions are classified (applications, design files, databases, fonts, disk images, binaries, folders).
- **Live refresh while the panel is open**: the active scope polls every **60 seconds** by default (configurable between 5–300 seconds or off in Settings), reusing short-lived Host scan caches to avoid repeated log scans; an explicit **Refresh** bypasses caches (`fresh=1`). The Sent index merges the current conversation first.
- **Missing files become ghost rows**: a user/@ or delivered file that disappears is kept as an **Missing** row with its last path, instead of vanishing. Files deleted through the plugin are tombstoned and do not return. If a moved file reappears in the same conversation with the same name/size, the Sent index relinks it as **Moved**; a cross-drive move with no new reference cannot be discovered automatically, so the ghost remains until the new path is sent or the row is cleared.
- **PDF/Office page preview** has a persistent toolbar (previous/next, page count, zoom, fit width, open sidebar, close). Clicking outside does not close it; right-clicking the page opens the file menu.
- **In-panel preview** for images, PDF, Markdown, text, and Office documents. Images switch with previous/next buttons or `←`/`→`; Word/PowerPoint/Excel are converted to PDF by the Host's `office-kit`, then rendered as page images.
- **Always-visible row actions and a floating context menu**: right-clicking (or clicking **Open with**) opens a scrollable menu at the pointer with preview, open/reveal, detected apps, copy, pin, archive, and **Delete file**.
- **History has a global back button** in the panel header after drilling into a project/conversation.
- **Preview context menu**: right-clicking an image preview offers copy-image, copy-path, reference, pin, archive, and delete.
- **Delete with confirmation**: permanently removes the file from disk after an explicit confirm; it also drops the pin and archive-manifest record. Use with care.
- **Open with** the detected desktop applications, **show in file manager**, or call the Windows system *Open with* dialog.
- **Insert reference / Attach** tries the optional `fileDrag` capability to attach the real file to the composer, and falls back smoothly to inserting a removable `@path` reference at the caret (or copying to the clipboard).
- **Pin** paths in a durable manifest outside the Session log, and recover them with the `file_launcher` tool after context compaction. Pins protect path memory only; files stay on disk.
- **Archive** copies into a dated folder under `$DSH_FILE_LAUNCHER_ARCHIVE_DIR`, your configured **Custom archive folder** in Settings, or `~/Documents/DeepSeekHarnessFileLauncher/Archived_Docs`. The original is never moved or deleted, and archived copies get an **Archived** badge and filter.
- **Agent tool** `file_launcher` with `list` (including global `sent`), `sessions`, `pin`, `unpin`, and `archive` actions.

## Install

The package is a DSH bundle. Add the package directory through **Plugins → Add plugin** (or install it with the plugin manager), then reload the page. The right Sidebar's **+** guide now offers **File launcher**.

**Install from GitHub:**

1. Open **Plugins → Add plugin**.
2. Choose the **default / GitHub** installation source (the mainland mirror is mainly for npm packages and may not proxy GitHub).
3. Enter `https://github.com/ZOU2850/dsh-file-launcher`.
4. Click **Install**.
5. Fully quit and reopen DSH after installation (1.4.x changes the Host scanning and settings modules).

If GitHub installation fails, use the local checkout path in the same field. Remove or disable any existing `dsh-file-launcher` install first to avoid a duplicate instance.

The Host half needs the Web profile's `tools`, `fs`, `sessionQuery`, `connection`, and `attachments` services. The browser half registers a page-type tab plus the header and composer quick entries, so no resource pattern or extra config is required.

## Usage

1. Open the right Sidebar and choose the **File launcher** guide card (the **+** control in the tab strip), click the folder button in the conversation header's right-side utilities, or click the **Files** pill at the left of the composer tool row.
2. Pick a scope: **Conversation**, **Sent by me**, **Project**, **Pinned**, or **History**. In History, expand a project group and choose a conversation.
3. Click a row to preview in the panel; images and Office documents preview there with previous/next navigation. Use **Open with** for native applications, or **Select** for batch **Insert reference**, **Pin**, and **Archive**.
4. Right-click any row (or image preview) for the floating menu; **Delete file** asks for confirmation first.

### Settings

Open **Settings** from the avatar menu; the **File launcher** section controls:

**Appearance** — theme (follow DSH / light / dark / follow system). Changing it applies immediately to an open Sidebar and saves to `settings.json` plus the browser-local cache for restarts and upgrades.

**Behavior, preview, and paths** — auto-refresh toggle and interval (5–300 s), default scope, collapsed-by-default groups, PDF page limit/DPI, rows per load, custom archive directory override, and the data/index/archive locations.

Preferences persist to `$DSH_HOME/file-launcher/settings.json`, outside the profile patch, so upgrades do not overwrite them.

## Compatibility and upgrades

- Tested on **DSH Desktop 0.2.2-rc.3 / Electron 44.7 / Node 24.21**.
- Uses public extension points only (`ctx.tools`, `ctx.connection.fetch`, Cordis services, client `slots`/`sidebarRightTabs`/`locale`/remotes); it imports no `@deepseek-ai/dsh-*` package and lists optional capabilities (`officeKit`, `fileDrag`) without blocking startup.
- Settings register lazily through `settings.section`; on an older DSH without that slot the page is simply absent and the plugin still loads. A future change to that slot contract requires an update.
- Reinstall/re-enable the bundle, **fully quit and reopen DSH**, then refresh. Pins, sent index, archive manifest, settings, and deletion tombstones live under `$DSH_HOME/file-launcher/` and survive upgrades.

## Performance and resources

- **No model tokens** are consumed by the panel, previews, or auto-refresh. Only an explicit `file_launcher` tool call enters context (60 rows by default; lower it with `limit`).
- Auto-refresh defaults to **60 seconds**, can be adjusted (5–300 s) or disabled in Settings, and aborts stale requests instead of stacking them.
- The panel loads at most 800 rows by default; PDF rendering defaults to 20 pages (maximum 40). Regular PDFs render directly from their Host path without base64 transfers.
- Memory is dominated by DSH/Chromium and any open page images; temporary preview links under `$DSH_HOME/file-launcher/previews` are pruned automatically.

## Configuration

No plugin config is required. Optional environment variables:

| Variable | Meaning |
|---|---|
| `DSH_HOME` | Harness home used for `file-launcher/pins.json`, `archive.json`, and image preview links (defaults to `~/.dsh`). |
| `DSH_FILE_LAUNCHER_ARCHIVE_DIR` | Overrides the archive root. |

## Development notes

- Host: `index.js`, `lib/inventory.js`, `lib/store.js`, `lib/routes.js`, `lib/tool.js`.
- Browser: `client.js` (plain `__ModuleLoader__` factory, React only).
- Locales: `locale/en.json`, `locale/zh.json` (Plugin Manager metadata); the panel dictionaries live in `client.js`.
- Icon: `icon.svg`.

## Limitations

- Files created only by shell commands without a tool result or `present` declaration are attributed to the workspace, not the conversation.
- Native opening requires a Host desktop.
- Office in-panel preview depends on the profile's `office-kit` provider and LibreOffice Kit. Excel falls back to the Sidebar preview when `officeKit` is unavailable. Host packages, versions, and diagnostics are documented in [`docs/HOST-REQUIREMENTS.md`](docs/HOST-REQUIREMENTS.md).
- PDF page rendering depends on local `pdfinfo` / `pdftoppm`; without them the preview shows an error and keeps **Open in sidebar**.
- A folder `@path` gets an Explorer entry; its contents are not expanded recursively.
- **Sent by me** reads up to 20 recent top-level conversations, sequentially and only on first access. The index is persisted in `$DSH_HOME/file-launcher/sent-index.json` (can be rebuilt on demand with **Refresh**); startup never prewarms it.
- **Ghost rows cover user/@ and delivered files.** Workspace-only files are discovered by directory scan; if one is deleted outside the plugin and was never referenced by the conversation, there is no historical path to keep as a ghost.
- **Moved files cannot be found by magic.** Cross-drive moves with no new message/reference keep the old ghost; relink needs the new path to reappear in a scanned session or a manual re-send.
- **Live refresh is periodic polling (default 60 s).** It is intentionally not a filesystem watcher; a just-created file appears on the next tick or via manual **Refresh**.
- **Insert reference / Attach:** uses the optional `fileDrag` service when available, falling back to `@path` text in the composer or clipboard.
- **User @ paths are parsed**: a file is filed as a user file with a **Reference** badge, appears under both **User** and **Sent by me**, and clicking the badge or choosing **Trace reference origin** shows the source conversation, project, message position, time, and original text. Folders get an Explorer entry; special extensions are auto-classified. Quoted `@"path with spaces"` and quoted mentions directly after Chinese text are supported.
- **Delete file** is permanent and cannot be undone; it is never triggered by archive or pin.
- Pins are host-global and not part of Session export; they protect path memory, never delete or move files.
- Archive copies are plain files with no version history; the original is kept.
- Normalized image attachments are extensionless; the Host publishes extension-bearing preview links under `$DSH_HOME/file-launcher/previews` while the attachment object remains the file of record.

See [`docs/DETAIL.md`](docs/DETAIL.md) for the full behavior and the route/tool contracts; see [`docs/QA.md`](docs/QA.md) for resource measurements and the upgrade checklist.
