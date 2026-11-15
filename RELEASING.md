# Releasing

Publishing is **manual**. The repository intentionally does not enable an automatic push hook while the plugin is still being stabilized.

## Current stable snapshot

The frozen snapshot is the Git tag `stable-2026-11-15` (and the `v1.4.3` release). Both remain available for rollback.

## Manual release checklist

1. Run `npm test`.
2. Bump `package.json` version (semver) and add a `CHANGELOG.md` entry.
3. Update README/DETAIL when behavior changes.
4. Commit locally.
5. Only after an explicit request to publish:
   ```sh
   git push origin main
   git tag -a stable-YYYY-MM-DD -m "Stable snapshot"
   git push origin stable-YYYY-MM-DD
   git archive --format=zip --output=../dsh-file-launcher-<version>.zip HEAD
   gh release create v<version> ../dsh-file-launcher-<version>.zip \
     --title "dsh-file-launcher <version>" --notes-file CHANGELOG.md
   ```

`.githooks/post-commit` is kept as an optional convenience, but it is **not active** (`git config core.hooksPath` is unset). Do not enable it during stabilization.

## Rollback

Git history is retained. Prefer a new revert commit over force-pushing:

```sh
git revert <bad-commit>
```

GitHub also offers **Revert** on a pull request or commit. Old release archives remain downloadable from the Releases page. Avoid rewriting `main`; if a tag must be moved, do it deliberately and re-check every release asset.
