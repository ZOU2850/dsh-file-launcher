# Changelog

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
