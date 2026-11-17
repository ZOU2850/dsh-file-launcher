# Working rules

- **Do not change the plugin's features or user-facing UX unless the user explicitly asks for that change.** When the user reports a bug, fix only the bug: no redesigns, no extra fallbacks, no silently changed behavior.
- Keep the user's existing design, categories, scopes, and interaction model intact.
- Add automated coverage for a bug fix where practical, then run `npm test`.
- Publishing is manual. Do not push or create a GitHub Release unless the user explicitly asks to upload/publish.
- Record real limitations in `docs/HOST-REQUIREMENTS.md` instead of hiding them behind a fallback that changes what the user sees.
