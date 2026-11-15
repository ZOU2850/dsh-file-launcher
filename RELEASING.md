# Releasing

The plugin is published from `main`; every user-visible update is tested, committed, pushed, and released.

## Automatic push

This checkout uses `.githooks/post-commit` as its hooks directory:

```sh
git config core.hooksPath .githooks
```

Any commit on `main` is pushed to `origin/main` immediately. Set `DFL_SKIP_PUSH=1` for an intentionally local commit.

## Release checklist

1. Run `npm test`.
2. Bump `package.json` version (semver) and add a `CHANGELOG.md` entry.
3. Update README/DETAIL when behavior changes.
4. Commit; the post-commit hook pushes `main`.
5. Build the release archive and publish it:

```sh
git archive --format=zip --output=../dsh-file-launcher-<version>.zip HEAD
gh release create v<version> ../dsh-file-launcher-<version>.zip \
  --title "dsh-file-launcher <version>" --notes-file CHANGELOG.md
```

`v1.4.3` and earlier releases were published manually; future updates follow this flow.
