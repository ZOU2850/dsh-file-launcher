# Changelog

## 1.4.10

### Added

- **Copy command** in the in-panel Office help card: users can copy a ready-to-send DSH instruction (repository, latest release, remove old version, restart, and officeKit check) and paste it into DSH so the agent can download/install on their behalf.

## 1.4.9

### Added

- **Self-service Office help in the failure card**: when an Office preview fails, the plugin shows the host status, four concrete steps, a **Download latest package** link, and a **Copy instructions** button. Users no longer need an external explanation. The card keeps the explicit “Open in default app” action; there is still no automatic Sidebar redirect.

## 1.4.8

### Changed

- **Office preview is always in-panel**: removed the automatic Sidebar redirect. A failed Office conversion stays in the plugin with its error and an explicit, optional “Open in Sidebar” action.
- **Load the document-preview provider with the plugin**: `@deepseek-ai/dsh-client-ui-sidebar-documentpreview` is now part of `dsh.client.inject`, so a fresh standard DSH install has the `remote.officeKit` provider available without relying on another UI having opened it first.
- **No feature mixing**: automatic Excel/Word/PowerPoint fallback to the Sidebar is gone. The Sidebar is only a user-chosen action on an error card.

### Fixed

- Host diagnostics from 1.4.7 remain: `health.officeKit` and a visible host warning when the conversion service is absent.

## 1.4.7

### Fixed

- **Office host diagnostics**: `/api/file-launcher.health` now reports `officeKit` / `capabilities.officeKit`; the panel warns when the current Host lacks the conversion service instead of failing each Office preview with a generic message.
- **Excel fallback**: when the Host reports no `officeKit`, `.xls/.xlsx/.xlsm` opens through the Sidebar's standard browser spreadsheet preview instead of the unavailable conversion path.
- **Host documentation**: added `docs/HOST-REQUIREMENTS.md` covering the OfficeKit provider, LibreOffice Kit, client document-preview package, minimum DSH profile, and verification steps.

## 1.4.6

### Changed

- Shared Session metadata/Session-record reads and a short-lived metadata cache, with per-view prefetching; project scope can open its directory without replaying the conversation first.
- Workspace scans share one pending operation and cancel idle work, so overlapping refreshes no longer queue duplicate directory walks.
- Session observations are rented only while events are consumed and disposed before filesystem I/O.

### Fixed

- Pin/archive manifests with an unrecognized shape or version are now treated as unreadable instead of silently read as empty; writes refuse to overwrite them.
- Archive copies use exclusive creation with numbered collision names, preventing a concurrent copy from overwriting an existing file.

## 1.4.5

### Fixed

- **Instant local workspace project opening (~99ms on 1,400+ files)**: `scanWorkspace` now verifies local disk roots against `ctx.fs` once and walks directories with 16 concurrent `node:fs/promises` workers + 24-concurrent `stat`, keeping mock/remote providers seamlessly on the `ctx.fs` fallback.
- **Newest files never cut off (`_build` / large repo safety)**: collects up to 6,000 matching workspace candidates and sorts by `mtime` descending *before* applying the 750-row cap, so older build/code trees no longer hide newer deliverables in subsequent directories.
- **Immediate capture of newly created files**: attaches recursive `fs.watch` invalidation (cleaned via `InventoryService.dispose()`), removes the 5-second `fresh=1` bypass guard in `scanSessionObserved`, listens to `sessionRow.updatedAt` / window focus / `pointerenter` / visibility in `client.js`, and tightens default visible polling to 10s.
- **Large Office/PDF preview comfort & quick bypass**: caches rendered page previews in `viewerCacheRef` for instant reopening and adds **Open in default app now** / **Reveal file** buttons right inside the viewer loading card.

## 1.4.4

### Added

- **Reference origin and badge**: a user `@path` reference is shown under **User** / **Sent by me** with a clickable **引用 / Reference** badge and retains its source conversation, project, message sequence, timestamp, and excerpt. Right-click **追溯引用位置** opens the origin card.
- The model-facing `file_launcher` tool marks reference rows with `referenced`.
- **Desktop app auto-detection & extensionless fallback (`lib/apps.js`)**: automatically matches installed desktop software (Word/Excel/PPT, WPS Office modes, VS Code/Cursor/Trae/Notepad++, PDF readers, browsers, Notepad) using batched `App Paths` registry queries and per-extension `UserChoice`/`OpenWithProgids`, including fallback editor matching for extensionless files and dotfiles (e.g. `.gitignore`, `post-commit`), plus host capability diagnostics when the backend awaits reload.
- **Reassuring loading state with ETA**: list loading (Conversation / Sent by me / Project) and document/PDF preview loaders display progressive reassuring messages, an animated progress bar, elapsed seconds, and dynamically calibrated time estimates.

### Changed

- **Antigravity Codex UI & scope isolation alignment**: switched inline row actions to clean `插入` / `复制引用` / `打开方式 ▾` controls; aligned 19+ file categories (including `code` in Project scope); kept **Sent by me** and **Pinned** grouped **Project → Conversation** by default while making the top isolation selector dynamically mirror the active bottom tab (`Conversation`, `Sent by me`, `Pinned`, `Project`).

### Fixed

- **Faster Project scope opening**: parallelized `scanWorkspace` directory traversal (`8` concurrent workers, `16` concurrent stat lookups, expanded `SKIP_NAMES` filter, 45s cache TTL), skipped redundant `scanQueue` waits when `scanCache` hits, ran `scanSession` + `scanWorkspace` concurrently when `cwd` is known, and stored prefetched project inventory directly into `dataCache` ahead of background `sent` scans.

## 1.4.3

### Fixed

- **Insert reference works again**: the row/bulk actions use the composer `inputActions` path directly instead of trying a native file-drop attachment first. A captured revision is retried once, and if the Host exposes no `InputActions`, the plugin falls back to a plain-text insertion into the Lexical composer before ever copying to the clipboard.

## 1.4.2

### Fixed

- **Office previews were unavailable**: `remote.officeKit` is now loaded through an optional `ctx.inject(['remote', 'remote.officeKit'])` holder instead of being required in the top-level injection list. Word, PowerPoint and Excel can convert again on standard profiles; profiles without office-kit still load the rest of the plugin and show the existing unavailable message.
- Theme and Sidebar synchronization from 1.4.1 remain in place.

## 1.4.1

### Fixed

- **Host OOM on startup**: removed the startup `sent` index prewarm that scanned many Conversation logs in the background. The Host heap could climb to its 4 GB cap and take down the Gateway, after which every client request failed.
- **Sent rebuild memory spike**: the first “Sent by me” build now scans at most 20 recent Conversations **one at a time** (no concurrent observations) and no longer starts a background rebuild on a timer. A persisted index is read directly; prewarming is never reintroduced.
- **Appearance not reaching the Sidebar**: theme changes are now applied immediately through a document-level attribute and a local event, then persisted; the Sidebar no longer waits for a Save or a reopened panel.
- **Appearance scope reduced**: only light / dark / follow-system / follow-DSH themes remain. Skin, frosted, glass, and radius controls were removed.

### Changed

- Live refresh defaults to 60 seconds, configurable 5–300 seconds or off.
- Settings are stored separately in `$DSH_HOME/file-launcher/settings.json`; they are not written into the profile patch.
- Settings page is registered lazily; an older DSH without `settings.section` still loads the rest of the plugin.

## 1.3.x

- PDF/Office page preview toolbar, missing-file ghosts and tombstones, project → conversation grouping, `@` path/folder resolution, and live inventory refresh.
