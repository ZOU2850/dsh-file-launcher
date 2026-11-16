/**
 * Host-side file inventory for the File Launcher: what one conversation
 * produced, delivered, read, or received as an attachment; what its workspace
 * contains as readable documents; and the recent conversation catalog used by
 * the panel's history scope.
 *
 * The Session log is the source of truth. Every candidate path is verified
 * through `ctx.fs` before it reaches the client, so deleted files and
 * directories never appear as openable rows.
 */

import { watch } from 'node:fs'
import { copyFile, link, mkdir, readdir, stat as statFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import {
  baseName, categoryOf, displayPath, isInsideWorkspace, isReadingTool, pathKey, pathsFromResultMeta,
  pathsFromToolArguments, slashPath, CASE_INSENSITIVE_PATHS,
} from './util.js'

/** Source priority used for ordering and badges. */
const SOURCE_RANK = {
  delivered: 0,
  written: 1,
  edited: 2,
  attachment: 3,
  read: 4,
  workspace: 5,
}

/** Workspace-scan categories: includes deliverables, docs, media, and code files of the active project. */
const WORKSPACE_CATEGORIES = new Set([
  'document', 'slides', 'sheets', 'pdf', 'markdown', 'text', 'image', 'web', 'code', 'media', 'archive',
  'design', 'executable', 'database', 'font', 'disk', 'binary', 'other',
])

/** Workspace scan bounds. */
const WORKSPACE_MAX_DEPTH = 5
const WORKSPACE_MAX_FILES = 750
const WORKSPACE_CACHE_LIMIT = 8
const PREVIEW_CACHE_MAX_FILES = 120
const PREVIEW_PRUNE_INTERVAL_MS = 30 * 60 * 1000
const SENT_REBUILD_SESSION_LIMIT = 20

/** Default inventory response cap. */
const DEFAULT_LIMIT = 800

/**
 * Extract @-mention paths from a user's plain-text message, supporting quoted
 * references (`@"path with spaces"`), absolute paths, and workspace-relative paths.
 */
function pathsFromMentionText(text) {
  if (typeof text !== 'string' || !text.includes('@')) return []
  const found = []
  const seen = new Set()
  const add = (raw) => {
    const candidate = String(raw).trim().replace(/^["']+|["']+$/g, '').replace(/[),.;，。；、]+$/u, '')
    if (candidate.length === 0 || seen.has(candidate)) return
    seen.add(candidate)
    found.push(candidate)
  }
  const quotedPatterns = [
    /@"([^"\r\n]+)"/gu,
    /@'([^'\r\n]+)'/gu,
  ]
  for (const pattern of quotedPatterns) {
    for (const match of text.matchAll(pattern)) add(match[1])
  }
  const absolutePatterns = [
    /@([A-Za-z]:[\\/][^\r\n@"]*)/g,
    /@(\\\\[^\r\n@"]*)/g,
    /(?:^|[\s(\[{（【'"])@(\/[^\r\n@"]*)/gu,
  ]
  for (const pattern of absolutePatterns) {
    for (const match of text.matchAll(pattern)) add(match[1])
  }
  // Also recognize unquoted workspace-relative mentions (must include a separator or extension, not bare @name).
  for (const match of text.matchAll(/(?:^|[\s(\[{（【'"])@([^\s"'@\\/:*?<>|][^\r\n@"]*)/gu)) {
    const raw = match[1]
    if (/^[A-Za-z]:[\\/]|^\\\\|^\//.test(raw)) continue
    const firstToken = raw.split(/\s+/)[0].replace(/[),.;，。；、]+$/u, '')
    if (firstToken.includes('/') || /\.[A-Za-z0-9]{1,10}$/u.test(firstToken)) add(firstToken)
  }
  return found
}

/** Merge two inventory rows pointing to the same canonical path without losing stronger metadata. */
function mergeResolvedRow(existing, incoming) {
  if ((SOURCE_RANK[incoming.source] ?? 9) < (SOURCE_RANK[existing.source] ?? 9)) {
    existing.source = incoming.source
  }
  if (incoming.description !== undefined && existing.description === undefined) existing.description = incoming.description
  if (incoming.previewPath !== undefined && existing.previewPath === undefined) existing.previewPath = incoming.previewPath
  if (incoming.size !== undefined && existing.size === undefined) existing.size = incoming.size
  if (incoming.mtime !== undefined && (existing.mtime === undefined || incoming.mtime > existing.mtime)) existing.mtime = incoming.mtime
  if (existing.missing === true && incoming.missing !== true) existing.missing = false
  if (incoming.reference === true) {
    existing.reference = true
    if (incoming.referenceOrigin !== undefined) existing.referenceOrigin = incoming.referenceOrigin
  }
  if (incoming.rel !== undefined && (existing.rel === undefined || existing.rel.length === 0)) existing.rel = incoming.rel
  return existing
}

/** Run an async mapper over items with a small concurrency bound. */
async function mapLimit(items, limit, mapper) {
  if (items.length === 0) return []
  const results = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

/** Reject immediately if a caller signal aborts while waiting on a shared promise. */
function raceWithAbort(promise, signal) {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'))
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      value => { signal.removeEventListener('abort', onAbort); resolve(value) },
      error => { signal.removeEventListener('abort', onAbort); reject(error) },
    )
  })
}

/** Normalize a Session event timestamp to epoch milliseconds. */
function epoch(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/**
 * Read a file's modification time through the local Node runtime when the
 * execution-world path is a local path. Remote providers simply omit it.
 * @param path - absolute process path.
 * @returns epoch milliseconds, or undefined.
 */
async function modificationTime(path) {
  try {
    const information = await statFile(path)
    return information.mtimeMs
  } catch {
    return undefined
  }
}

/** Merge one candidate into a keyed map without losing a stronger source. */
function addCandidate(map, rawPath, source, description, extra = {}) {
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) return
  const key = pathKey(rawPath, CASE_INSENSITIVE_PATHS)
  const previous = map.get(key)
  if (previous === undefined) {
    map.set(key, { rawPath: rawPath.trim(), source, description, ...extra })
    return
  }
  if ((SOURCE_RANK[source] ?? 9) < (SOURCE_RANK[previous.source] ?? 9)) previous.source = source
  if (description !== undefined && previous.description === undefined) previous.description = description
  if (extra.displayName !== undefined && previous.displayName === undefined) previous.displayName = extra.displayName
  if (extra.previewPath !== undefined && previous.previewPath === undefined) previous.previewPath = extra.previewPath
  if (extra.size !== undefined && previous.size === undefined) previous.size = extra.size
  if (extra.time !== undefined && previous.time === undefined) previous.time = extra.time
  if (extra.kind !== undefined && previous.kind === undefined) previous.kind = extra.kind
  if (extra.reference === true) {
    previous.reference = true
    if (extra.referenceOrigin !== undefined) previous.referenceOrigin = extra.referenceOrigin
  }
}

/** Sort inventory rows for the panel and the agent tool. */
function sortRows(rows) {
  return rows.sort((left, right) => {
    const rank = (SOURCE_RANK[left.source] ?? 9) - (SOURCE_RANK[right.source] ?? 9)
    if (rank !== 0) return rank
    const time = (right.mtime ?? 0) - (left.mtime ?? 0)
    if (time !== 0) return time
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  })
}

/** Count rows by category and source. */
function summarize(rows) {
  const categories = {}
  const sources = {}
  for (const row of rows) {
    categories[row.category] = (categories[row.category] ?? 0) + 1
    sources[row.source] = (sources[row.source] ?? 0) + 1
  }
  return {
    counts: { all: rows.length, ...categories },
    sources,
  }
}

/** File Launcher inventory service. */
export class InventoryService {
  /**
   * @param ctx - Host context carrying `fs` and `sessionQuery`.
   * @param store - pin and archive storage.
   */
  constructor(ctx, store) {
    this.ctx = ctx
    this.store = store
    this.sentCache = undefined
    this.sentIndexLoaded = false
    this.sentRebuilding = false
    this.sentRebuildPromise = undefined
    this.workspaceCache = new Map()
    this.workspaceWatchers = new Map()
    this.scanCache = new Map()
    this.scanPending = new Map()
    this.sessionCwdCache = new Map()
    this.scanQueue = Promise.resolve()
    this.lastPreviewPrune = 0
  }

  /** Close open filesystem watchers on plugin reload or host shutdown. */
  dispose() {
    for (const entry of this.workspaceWatchers.values()) {
      clearTimeout(entry.timer)
      try { entry.watcher.close() } catch {}
    }
    this.workspaceWatchers.clear()
  }

  /** Watch a verified local workspace directory so newly created files invalidate cache immediately. */
  watchWorkspaceRoot(cacheKey, cwd) {
    if (this.workspaceWatchers.has(cacheKey)) return
    try {
      const entry = {
        timer: undefined,
        watcher: watch(cwd, { recursive: true, persistent: false }, () => {
          clearTimeout(entry.timer)
          entry.timer = setTimeout(() => {
            this.workspaceCache.delete(cacheKey)
          }, 90)
        }),
      }
      entry.watcher.on('error', () => {
        clearTimeout(entry.timer)
        try { entry.watcher.close() } catch {}
        this.workspaceWatchers.delete(cacheKey)
      })
      this.workspaceWatchers.set(cacheKey, entry)
      while (this.workspaceWatchers.size > 5) {
        const oldestKey = this.workspaceWatchers.keys().next().value
        const oldest = this.workspaceWatchers.get(oldestKey)
        this.workspaceWatchers.delete(oldestKey)
        if (oldest) {
          clearTimeout(oldest.timer)
          try { oldest.watcher.close() } catch {}
        }
      }
    } catch {
      // Recursive fs.watch is unavailable on some platforms; passive TTL still protects freshness.
    }
  }

  /** Fast header-only lookup of a Session's cwd without decompressing the full Session log. */
  async resolveSessionCwdFast(sessionId, signal) {
    try {
      const sessionQuery = this.ctx.get('sessionQuery')
      if (!sessionQuery || typeof sessionQuery.listSessions !== 'function') return undefined
      const records = await sessionQuery.listSessions(signal)
      const hit = Array.isArray(records) ? records.find(item => item?.header?.id === sessionId) : undefined
      return typeof hit?.header?.cwd === 'string' && hit.header.cwd.length > 0 ? hit.header.cwd : undefined
    } catch {
      return undefined
    }
  }

  /** Required filesystem service. */
  fs() {
    const fs = this.ctx.get('fs')
    if (fs === undefined) throw new Error('The file launcher needs the filesystem service.')
    return fs
  }

  /** Required session history service. */
  sessionQuery() {
    const sessionQuery = this.ctx.get('sessionQuery')
    if (sessionQuery === undefined) throw new Error('The file launcher needs the session history service.')
    return sessionQuery
  }

  /**
   * Build one inventory response.
   * @param request - session, scope, limit, and cancellation.
   * @returns files plus category/source counts.
   */
  async inventory({ sessionId, scope = 'session', limit = DEFAULT_LIMIT, signal, fresh = false } = {}) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new Error('A session id is required.')
    }
    const startedAt = Date.now()
    if (scope === 'sent') {
      const sentResult = await this.sentInventory({ limit, signal, sessionId, fresh })
      return { ...sentResult, durationMs: Date.now() - startedAt }
    }
    const bounded = Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, 2000))
    let cachedScanCwd = this.scanCache.get(`${sessionId}:all`)?.value?.cwd || this.sessionCwdCache.get(sessionId)
    if (scope === 'project' && (!cachedScanCwd || typeof cachedScanCwd !== 'string')) {
      cachedScanCwd = await this.resolveSessionCwdFast(sessionId, signal)
      if (typeof cachedScanCwd === 'string' && cachedScanCwd.length > 0) {
        this.sessionCwdCache.set(sessionId, cachedScanCwd)
      }
    }
    let sessionScan
    let preloadedWorkspace
    if (scope === 'project' && typeof cachedScanCwd === 'string' && cachedScanCwd.length > 0) {
      ;[sessionScan, preloadedWorkspace] = await Promise.all([
        this.scanSession(sessionId, signal, { fresh }),
        this.scanWorkspace(cachedScanCwd, signal, fresh),
      ])
    } else {
      sessionScan = await this.scanSession(sessionId, signal, { fresh })
    }
    if (typeof sessionScan.cwd === 'string' && sessionScan.cwd.length > 0) {
      this.sessionCwdCache.set(sessionId, sessionScan.cwd)
    }
    let rows = sessionScan.rows
    let truncated = sessionScan.truncated
    if (scope === 'project') {
      // Project scope is the workspace plus what this conversation delivered.
      // Reads, attachments, and generated files outside the root belong to the
      // conversation scope, not to the project.
      rows = rows.filter(row => row.source === 'delivered' || isInsideWorkspace(row.path, sessionScan.cwd))
      const workspaceRows = preloadedWorkspace !== undefined && sessionScan.cwd === cachedScanCwd
        ? preloadedWorkspace
        : await this.scanWorkspace(sessionScan.cwd, signal, fresh)
      const present = new Set(rows.map(row => pathKey(row.path, CASE_INSENSITIVE_PATHS)))
      for (const row of workspaceRows.rows) {
        if (!present.has(pathKey(row.path, CASE_INSENSITIVE_PATHS))) {
          rows.push(row)
          present.add(pathKey(row.path, CASE_INSENSITIVE_PATHS))
        }
      }
      truncated = truncated || workspaceRows.truncated
    }
    sortRows(rows)
    if (rows.length > bounded) {
      rows = rows.slice(0, bounded)
      truncated = true
    }
    await this.markArchived(rows)
    const summary = summarize(rows)
    return {
      ok: true,
      sessionId,
      cwd: sessionScan.cwd,
      scope,
      files: rows,
      truncated,
      ...summary,
      scannedEvents: sessionScan.scannedEvents,
      durationMs: Date.now() - startedAt,
    }
  }

  /**
   * Collect user-sent files across every recent top-level conversation.
   * The result is cached briefly because it reads several Session logs.
   * @param request - response limit and cancellation.
   * @returns rows annotated with their conversation and project.
   */
  async sentInventory({ limit = DEFAULT_LIMIT, signal, sessionId, fresh = false } = {}) {
    const bounded = Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, 2000))
    await this.ensureSentIndex()
    if (fresh === true && typeof sessionId !== 'string'
      && this.sentCache !== undefined && Date.now() - this.sentCache.at > 5_000) {
      return this.rebuildSent({ limit: bounded, signal })
    }
    if (this.sentCache !== undefined) {
      if (typeof sessionId === 'string' && sessionId.length > 0) {
        try {
          const scan = await this.scanSession(sessionId, signal, { sentOnly: true, fresh })
          const previous = this.sentCache.result.files
          const template = previous.find(row => row.sessionId === sessionId)
          const metaMap = await this.sessionMetadataMap(signal)
          const sessionMeta = metaMap.get(sessionId)
          const sessionCwd = scan.cwd || sessionMeta?.cwd || template?.cwd
          const projectName = template?.projectName || (sessionCwd === undefined ? undefined : baseName(sessionCwd))
          const sessionTitle = sessionMeta?.title || template?.sessionTitle || scan.fallbackTitle
          const refreshed = scan.rows
            .filter(row => row.source === 'attachment')
            .map(row => ({
              ...row,
              ...(sessionCwd === undefined ? {} : { cwd: sessionCwd }),
              ...(sessionTitle === undefined ? {} : { sessionTitle }),
              ...(projectName === undefined ? {} : { projectName }),
            }))
          await this.markArchived(refreshed)
          const previousSessionRows = previous.filter(row => row.sessionId === sessionId)
          const liveRefreshed = refreshed.filter(row => row.missing !== true)
          if (liveRefreshed.length > 0) {
            await this.store.clearDeleted(liveRefreshed.map(row => row.path))
          }
          const livePaths = new Set(liveRefreshed.map(row => pathKey(row.path, CASE_INSENSITIVE_PATHS)))
          const currentRows = refreshed.slice()
          const used = new Set()
          for (const oldRow of previousSessionRows) {
            const oldKey = pathKey(oldRow.path, CASE_INSENSITIVE_PATHS)
            if (livePaths.has(oldKey)) continue
            if (await this.store.isDeleted(oldRow.path)) continue
            const moved = liveRefreshed.find(row => {
              const rowKey = pathKey(row.path, CASE_INSENSITIVE_PATHS)
              return !used.has(rowKey)
                && row.name === oldRow.name
                && row.isFolder === oldRow.isFolder
                && (row.size === undefined || oldRow.size === undefined || row.size === oldRow.size)
            })
            if (moved !== undefined) {
              used.add(pathKey(moved.path, CASE_INSENSITIVE_PATHS))
              moved.moved = true
              moved.movedFrom = oldRow.path
              const oldIndex = currentRows.findIndex(row =>
                pathKey(row.path, CASE_INSENSITIVE_PATHS) === oldKey && row.missing === true)
              if (oldIndex >= 0) currentRows.splice(oldIndex, 1)
            } else if (!currentRows.some(row => pathKey(row.path, CASE_INSENSITIVE_PATHS) === oldKey)) {
              currentRows.push({ ...oldRow, missing: true })
            }
          }
          const signature = rows => JSON.stringify(rows.map(row => [row.path, row.mtime, row.size, row.isFolder === true, row.missing === true, row.moved === true]))
          const changed = signature(previousSessionRows) !== signature(currentRows)
          const files = previous.filter(row => row.sessionId !== sessionId).concat(currentRows)
          await this.hydrateSentMetadata(files, signal)
          sortRows(files)
          const capped = files.slice(0, 1000)
          const result = {
            ...this.sentCache.result,
            files: capped,
            truncated: files.length > 1000,
            ...summarize(capped),
          }
          this.sentCache = { at: Date.now(), result }
          if (changed) void this.store.writeSentIndex(result.files).catch(() => {})
        } catch (error) {
          if (signal?.aborted) throw error
          // Keep the previous index if this one Session is momentarily unreadable.
        }
      }
      if (fresh && this.sentRebuilding === false) {
        // Explicit Refresh may rebuild the cross-conversation index; startup
        // and the auto-refresh timer never do. The rebuild is sequential and
        // bounded so a large history cannot recreate the old heap spike.
        void this.rebuildSent({ limit: 1000 }).catch(() => {})
      }
      return this.sliceSent(this.sentCache.result, bounded)
    }
    return this.rebuildSent({ limit: bounded, signal })
  }

  /** Load the persisted sent index once; the first paint is then instant. */
  async ensureSentIndex() {
    if (this.sentIndexLoaded) return
    this.sentIndexLoaded = true
    try {
      const index = await this.store.readSentIndex()
      if (index.rows.length > 0) {
        const verified = await mapLimit(index.rows, 8, async row => {
          if (row.isFolder === true) {
            const directory = await this.verifyDirectory(row.path, { cwd: row.cwd })
            return { ...row, missing: directory === undefined }
          }
          const file = await this.verifyFile(row.path, { cwd: row.cwd })
          return { ...row, missing: file === undefined, ...(file === undefined ? {} : { size: file.size ?? row.size }) }
        })
        const deleted = await this.store.readDeleted()
        const visible = verified.filter(row =>
          !(row.missing === true && deleted.has(pathKey(row.path, CASE_INSENSITIVE_PATHS))))
        const files = visible.slice(0, 1000)
        await this.hydrateSentMetadata(files, undefined)
        this.sentCache = {
          at: index.updatedAt,
          result: {
            ok: true,
            sessionId: null,
            scope: 'sent',
            files,
            truncated: visible.length > 1000,
            ...summarize(files),
            scannedSessions: undefined,
          },
        }
      }
    } catch {
      // A missing index is rebuilt by the first foreground request.
    }
  }

  /** Rebuild the sent index from Session logs, sharing one in-flight scan. */
  async rebuildSent({ limit = 1000, signal } = {}) {
    if (this.sentRebuilding && this.sentRebuildPromise !== undefined) {
      await raceWithAbort(this.sentRebuildPromise, signal)
      return this.sliceSent(this.sentCache.result, limit)
    }
    this.sentRebuilding = true
    const rebuild = (async () => {
      const sessions = await this.listSessions(60, undefined)
      const inspected = sessions.slice(0, SENT_REBUILD_SESSION_LIMIT)
      const rows = []
      let scanned = 0
      const batches = await mapLimit(inspected, 1, async session => {
        try {
          const scan = await this.scanSession(session.id, undefined, { sentOnly: true })
          const sessionCwd = scan.cwd || session.cwd
          const sessionTitle = session.title || scan.fallbackTitle
          const projectName = sessionCwd === undefined ? undefined : baseName(sessionCwd)
          return scan.rows
            .filter(row => row.source === 'attachment')
            .map(row => ({
              ...row,
              ...(sessionCwd === undefined ? {} : { cwd: sessionCwd }),
              ...(sessionTitle === undefined ? {} : { sessionTitle }),
              ...(projectName === undefined ? {} : { projectName }),
            }))
        } catch {
          // A single unreadable Session does not hide the rest.
          return []
        }
      })
      for (const batch of batches) {
        if (batch.length > 0) scanned += 1
        rows.push(...batch)
      }
      sortRows(rows)
      await this.markArchived(rows)
      const files = rows.slice(0, 1000)
      const result = {
        ok: true,
        sessionId: null,
        scope: 'sent',
        files,
        truncated: sessions.length > inspected.length || rows.length > 1000,
        ...summarize(files),
        scannedSessions: scanned,
      }
      this.sentCache = { at: Date.now(), result }
      try {
        await this.store.writeSentIndex(files)
      } catch {
        // The in-memory index still serves this run.
      }
      void this.prunePreviews().catch(() => {})
      return result
    })()
    this.sentRebuildPromise = rebuild
    try {
      await raceWithAbort(rebuild, signal)
      return this.sliceSent(this.sentCache.result, limit)
    } finally {
      if (this.sentRebuildPromise === rebuild) {
        this.sentRebuilding = false
        this.sentRebuildPromise = undefined
      }
    }
  }

  /** Drop the short-lived cross-conversation sent cache after a mutation. */
  invalidateSentCache() {
    this.sentCache = undefined
    this.sentIndexLoaded = true
  }

  /** Load session ID -> { title, cwd } snapshot map cleanly for sent-index hydration. */
  async sessionMetadataMap(signal) {
    try {
      const sessions = await this.listSessions(70, signal)
      return new Map(sessions.map(item => [item.id, item]))
    } catch {
      return new Map()
    }
  }

  /** Backfill missing `sessionTitle`, `cwd`, and `projectName` on sent rows in-place. */
  async hydrateSentMetadata(rows, signal) {
    if (!Array.isArray(rows) || rows.length === 0) return rows
    const needsHydration = rows.some(row => row && row.sessionId && (!row.sessionTitle || !row.cwd || !row.projectName))
    if (!needsHydration) return rows
    const byId = await this.sessionMetadataMap(signal)
    if (byId.size === 0) return rows
    for (const row of rows) {
      if (!row || !row.sessionId) continue
      const meta = byId.get(row.sessionId)
      if (!meta) continue
      if (!row.cwd && meta.cwd) row.cwd = meta.cwd
      if (!row.projectName && (row.cwd || meta.cwd)) row.projectName = baseName(row.cwd || meta.cwd)
      if (!row.sessionTitle && meta.title) row.sessionTitle = meta.title
    }
    return rows
  }

  /** Slice a cached sent result while preserving its summary and flags. */
  sliceSent(result, limit) {
    if (result.files.length <= limit) return result
    const files = result.files.slice(0, limit)
    return { ...result, files, truncated: true, ...summarize(files) }
  }

  /** Attach archive-manifest facts to rows whose source path was copied. */
  async markArchived(rows) {
    try {
      const archive = await this.store.readArchive()
      const byPath = new Map(archive.records.map(record => [pathKey(record.sourcePath, CASE_INSENSITIVE_PATHS), record]))
      for (const row of rows) {
        const record = byPath.get(pathKey(row.path, CASE_INSENSITIVE_PATHS))
        if (record !== undefined) {
          row.archived = true
          row.archivedAt = record.archivedAt
          row.archivePath = record.archivePath
        }
      }
    } catch {
      // The archive badge is optional.
    }
  }

  /**
   * Scan one Session log for produced, delivered, read, and attached files.
   * Concurrent requests for the same Session share one observation, and
   * separate Sessions inspect one borrowed history at a time.
   * @param sessionId - Session to read.
   * @param signal - cancellation.
   * @param options - `sentOnly` skips every event except user messages.
   * @returns verified rows, workspace root, and scan facts.
   */
  async scanSession(sessionId, signal, options = {}) {
    signal?.throwIfAborted()
    const sentOnly = options.sentOnly === true
    const fresh = options.fresh === true
    const cacheHit = this.scanCache.get(`${sessionId}:${sentOnly ? 'sent' : 'all'}`)
    if (!fresh && cacheHit !== undefined && Date.now() - cacheHit.at < 8_000) {
      return cacheHit.value
    }
    const key = `${sessionId}:${sentOnly ? 'sent' : 'all'}:${fresh ? 'fresh' : 'cached'}`
    let entry = this.scanPending.get(key)
    if (entry === undefined) {
      const controller = new AbortController()
      const listeners = new Set()
      entry = {
        waiters: 0,
        addSignal(waiterSignal) {
          this.waiters += 1
          if (!waiterSignal) return () => { this.removeWaiter() }
          const onAbort = () => {
            this.removeWaiter(true)
          }
          if (waiterSignal.aborted) {
            this.removeWaiter(true)
            return () => {}
          }
          waiterSignal.addEventListener('abort', onAbort, { once: true })
          const cleanup = () => {
            waiterSignal.removeEventListener('abort', onAbort)
            this.removeWaiter(false)
          }
          listeners.add(cleanup)
          return () => {
            if (listeners.delete(cleanup)) cleanup()
          }
        },
        removeWaiter(fromAbort = false) {
          this.waiters = Math.max(0, this.waiters - 1)
          if (fromAbort && this.waiters === 0) controller.abort()
        },
        promise: null,
      }
      const scan = this.scanQueue.then(() => {
        if (controller.signal.aborted) controller.signal.throwIfAborted()
        return this.scanSessionObserved(sessionId, controller.signal, options)
      })
      this.scanQueue = scan.then(() => undefined, () => undefined)
      entry.promise = scan
      this.scanPending.set(key, entry)
      scan.finally(() => {
        if (this.scanPending.get(key) === entry) this.scanPending.delete(key)
      }).catch(() => {})
    }

    const releaseWaiter = entry.addSignal(signal)
    try {
      return await raceWithAbort(entry.promise, signal)
    } finally {
      releaseWaiter()
    }
  }

  /** Borrow a live/prepared history without cloning and replaying the whole log. */
  async scanSessionObserved(sessionId, signal, options = {}) {
    const sentOnly = options.sentOnly === true
    const fresh = options.fresh === true
    const cacheKey = `${sessionId}:${sentOnly ? 'sent' : 'all'}`
    const cached = this.scanCache.get(cacheKey)
    // A fresh request still reuses a very recent scan: the Session log cannot
    // have changed meaningfully within seconds, and re-reading a large log on
    // every tick starves the gateway.
    if (!fresh && cached !== undefined && Date.now() - cached.at < 8_000) return cached.value
    const sessionQuery = this.sessionQuery()
    const observation = typeof sessionQuery.observeSession === 'function'
      ? await sessionQuery.observeSession(sessionId, { signal, projectionMode: 'none' })
      : undefined
    let cwd
    let fallbackTitle
    let scannedEvents = 0
    const candidates = new Map()
    const rawAttachments = []
    const rawMentions = []
    try {
      const snapshot = observation === undefined
        ? await sessionQuery.readSession(sessionId)
        : { session: observation.header, events: observation.events }
      signal?.throwIfAborted()
      cwd = snapshot.session?.cwd
      const events = Array.isArray(snapshot.events) ? snapshot.events : []
      scannedEvents = events.length
      const calls = new Map()

      for (const event of events) {
        signal?.throwIfAborted()
        if (sentOnly && event.type !== 'user/message') continue
        switch (event.type) {
          case 'tool/call': {
            const data = event.data
            if (data && typeof data.callId === 'string') {
              calls.set(data.callId, { name: data.name, arguments: data.arguments })
            }
            break
          }
          case 'tool/result': {
            const data = event.data
            if (data?.message?.isError === true) break
            const call = calls.get(data?.message?.toolCallId)
            const toolName = typeof call?.name === 'string' ? call.name : ''
            const metaPaths = pathsFromResultMeta(data?.meta)
            if (metaPaths.length > 0) {
              const source = isReadingTool(toolName) ? 'read' : toolName === 'edit' || toolName === 'apply_patch' ? 'edited' : 'written'
              for (const path of metaPaths) addCandidate(candidates, path, source)
            }
            if (toolName.length > 0) {
              const source = isReadingTool(toolName) ? 'read' : toolName === 'edit' || toolName === 'apply_patch' ? 'edited' : 'written'
              for (const path of pathsFromToolArguments(toolName, call.arguments)) addCandidate(candidates, path, source)
            }
            break
          }
          case 'deliverables/presented': {
            const files = Array.isArray(event.data?.files) ? event.data.files : []
            for (const file of files) {
              if (file && typeof file === 'object') addCandidate(candidates, file.path, 'delivered', file.description)
            }
            break
          }
          case 'user/message': {
            const content = Array.isArray(event.data?.content) ? event.data.content : []
            const eventTime = epoch(event.time)
            for (const block of content) {
              if (block?.type === 'file' && block.attachment) {
                rawAttachments.push({ kind: 'file', attachment: block.attachment, time: eventTime })
              } else if (block?.type === 'image' && block.attachment) {
                rawAttachments.push({ kind: 'image', attachment: block.attachment, time: eventTime })
              } else if (block?.type === 'text' && typeof block.text === 'string') {
                if (fallbackTitle === undefined) {
                  const cleanSnippet = block.text
                    .replace(/@(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s@]+)/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                  if (cleanSnippet.length > 0) {
                    fallbackTitle = cleanSnippet.length > 24 ? `${cleanSnippet.slice(0, 22)}…` : cleanSnippet
                  }
                }
                rawMentions.push({
                  text: block.text,
                  time: eventTime,
                  seq: event.seq,
                  messageId: event.data?.id,
                  messageTime: event.time,
                })
              }
            }
            break
          }
          default:
            break
        }
      }
    } finally {
      // Release the borrowed Session observation immediately before performing filesystem I/O.
      observation?.[Symbol.dispose]?.()
    }

    for (const item of rawAttachments) {
      signal?.throwIfAborted()
      if (item.kind === 'file') {
        const hostPath = await this.attachmentHostPath(item.attachment)
        if (hostPath !== undefined) {
          addCandidate(candidates, hostPath, 'attachment', undefined, {
            displayName: item.attachment.name,
            size: item.attachment.bytes,
            time: item.time,
          })
        }
      } else {
        const hostPath = await this.attachmentImageHostPath(item.attachment)
        if (hostPath === undefined) continue
        const extension = imageExtension(item.attachment.mediaType)
        const displayName = item.attachment.name || `image-${String(item.attachment.attachmentId).replace(/^sha256:/, '').slice(0, 12)}${extension}`
        const previewPath = await this.ensureImagePreview(item.attachment, hostPath, signal)
        addCandidate(candidates, hostPath, 'attachment', undefined, {
          displayName,
          ...(previewPath === undefined ? {} : { previewPath }),
          size: item.attachment.bytes,
          time: item.time,
        })
      }
    }

    for (const entry of rawMentions) {
      signal?.throwIfAborted()
      // A user may send a file or folder as an @-reference instead of a
      // browser attachment. The mention may be followed by prose, so try
      // the full text first and then trim trailing words until the path
      // resolves (this also preserves real spaces inside the path).
      for (const mention of pathsFromMentionText(entry.text)) {
        const tokens = mention.split(/\s+/).filter(Boolean).slice(0, 8)
        let kind
        let resolvedPath
        for (let count = tokens.length; count >= 1; count -= 1) {
          const candidate = tokens.slice(0, count).join(' ')
          if (await this.verifyDirectory(candidate, { cwd, signal }) !== undefined) {
            kind = 'folder'
            resolvedPath = candidate
            break
          }
          if (await this.verifyFile(candidate, { cwd, signal }) !== undefined) {
            kind = 'file'
            resolvedPath = candidate
            break
          }
        }
        if (resolvedPath === undefined) {
          // Keep a ghost for a user file that has since been deleted or
          // moved. Trim trailing prose by keeping a plausible extension.
          for (let count = tokens.length; count >= 1; count -= 1) {
            const candidate = tokens.slice(0, count).join(' ')
            if (/\.[A-Za-z0-9]{1,10}$/u.test(candidate)) {
              resolvedPath = candidate
              kind = 'file'
              break
            }
          }
        }
        if (resolvedPath === undefined) continue
        addCandidate(candidates, resolvedPath, 'attachment', undefined, {
          displayName: baseName(slashPath(resolvedPath)),
          time: entry.time,
          reference: true,
          referenceOrigin: {
            sessionId,
            ...(typeof cwd === 'string' ? { cwd } : {}),
            messageSeq: entry.seq,
            ...(entry.messageId === undefined ? {} : { messageId: entry.messageId }),
            at: entry.time,
            excerpt: entry.text.length > 240 ? `${entry.text.slice(0, 237)}…` : entry.text,
          },
          ...(kind === 'folder' ? { kind: 'folder' } : {}),
        })
      }
    }

    const candidateList = [...candidates.values()]
    const verifiedRows = await mapLimit(candidateList, 6, async candidate => {
      signal?.throwIfAborted()
      const canGhost = candidate.source === 'attachment' || candidate.source === 'delivered'
      const referenced = candidate.reference === true
        ? {
            reference: true,
            ...(candidate.referenceOrigin === undefined ? {} : { referenceOrigin: candidate.referenceOrigin }),
          }
        : {}
      if (candidate.kind === 'folder') {
        const directory = await this.verifyDirectory(candidate.rawPath, { cwd, signal })
        if (directory === undefined) {
          if (canGhost && !(await this.store.isDeleted(candidate.rawPath))) {
            const name = candidate.displayName || baseName(slashPath(candidate.rawPath))
            return {
              path: candidate.rawPath,
              rel: name,
              name,
              ext: '',
              category: 'folder',
              source: candidate.source,
              isFolder: true,
              missing: true,
              ...referenced,
              ...(candidate.time === undefined ? {} : { mtime: candidate.time }),
              sessionId,
              ...(typeof cwd === 'string' ? { cwd } : {}),
            }
          }
          return undefined
        }
        const name = candidate.displayName || baseName(directory.path)
        return {
          path: directory.path,
          rel: name,
          name,
          ext: '',
          category: 'folder',
          source: candidate.source,
          isFolder: true,
          ...referenced,
          ...(candidate.time === undefined ? {} : { mtime: candidate.time }),
          sessionId,
          ...(typeof cwd === 'string' ? { cwd } : {}),
        }
      }
      const resolved = await this.verifyFile(candidate.rawPath, { cwd, signal })
      if (resolved === undefined) {
        if (canGhost && !(await this.store.isDeleted(candidate.rawPath))) {
          const displayName = candidate.displayName || baseName(slashPath(candidate.rawPath))
          return {
            path: candidate.rawPath,
            rel: candidate.displayName || displayName,
            name: displayName,
            ext: extensionOfName(displayName),
            category: categoryOf(displayName),
            source: candidate.source,
            missing: true,
            ...referenced,
            ...(candidate.description === undefined ? {} : { description: candidate.description }),
            ...(candidate.size === undefined ? {} : { size: candidate.size }),
            ...(candidate.time === undefined ? {} : { mtime: candidate.time }),
            sessionId,
            ...(typeof cwd === 'string' ? { cwd } : {}),
          }
        }
        return undefined
      }
      const displayName = candidate.displayName || baseName(resolved.path)
      const mtime = candidate.time ?? await modificationTime(resolved.path)
      return {
        path: resolved.path,
        rel: candidate.displayName || displayPath(resolved.path, cwd),
        name: displayName,
        ext: extensionOfName(displayName),
        category: categoryOf(displayName),
        source: candidate.source,
        ...referenced,
        ...(candidate.previewPath === undefined ? {} : { previewPath: candidate.previewPath }),
        ...(candidate.description === undefined ? {} : { description: candidate.description }),
        ...(candidate.size === undefined && resolved.size === undefined ? {} : { size: candidate.size ?? resolved.size }),
        ...(mtime === undefined ? {} : { mtime }),
        sessionId,
        ...(typeof cwd === 'string' ? { cwd } : {}),
      }
    })

    // Deduplicate after path resolution so a relative path (`./a.md` in `present`)
    // merges cleanly with an earlier absolute path (`C:/repo/a.md` in `write`).
    const mergedByPath = new Map()
    for (const row of verifiedRows) {
      if (row === undefined) continue
      const key = pathKey(row.path, CASE_INSENSITIVE_PATHS)
      const existing = mergedByPath.get(key)
      if (existing === undefined) mergedByPath.set(key, row)
      else mergeResolvedRow(existing, row)
    }

    const rows = [...mergedByPath.values()]
    const result = {
      rows,
      cwd,
      ...(fallbackTitle === undefined ? {} : { fallbackTitle }),
      truncated: false,
      scannedEvents,
    }
    this.scanCache.delete(cacheKey)
    this.scanCache.set(cacheKey, { at: Date.now(), value: result })
    while (this.scanCache.size > 16) this.scanCache.delete(this.scanCache.keys().next().value)
    return result
  }

  /**
   * Resolve one host attachment reference to a file path when the mounted
   * attachment backend is host-file-backed.
   * @param ref - `FileAttachmentRef` from a user message block.
   * @returns the host path, or undefined.
   */
  async attachmentHostPath(ref) {
    const attachments = this.ctx.get('attachments')
    if (attachments === undefined) return undefined
    try {
      return attachments.fileHostPath(ref)
    } catch {
      return undefined
    }
  }

  /**
   * Resolve one normalized image reference to its host object path.
   * @param ref - `ImageAttachmentRef` from a user message block.
   * @returns the host path, or undefined.
   */
  async attachmentImageHostPath(ref) {
    const attachments = this.ctx.get('attachments')
    if (attachments === undefined) return undefined
    try {
      return attachments.imageHostPath(ref)
    } catch {
      return undefined
    }
  }

  /**
   * Give a normalized image object a file name with its media extension. The
   * attachment object itself is content-addressed and extensionless, so the
   * Sidebar preview cannot choose an image renderer for it. A hard link (or a
   * copy when linking is unavailable) below `$DSH_HOME/file-launcher/previews`
   * provides a stable, extension-bearing path without duplicating bytes in the
   * normal case.
   * @param ref - normalized image reference.
   * @param hostPath - the attachment object's host path.
   * @param signal - cancellation.
   * @returns the preview path, or undefined when it cannot be published.
   */
  async ensureImagePreview(ref, hostPath, signal) {
    signal?.throwIfAborted()
    const extension = imageExtension(ref.mediaType)
    if (extension.length === 0) return undefined
    const digest = String(ref.attachmentId).replace(/^sha256:/, '')
    if (!/^[0-9a-f]{8,}$/i.test(digest)) return undefined
    const directory = join(this.store.home, 'file-launcher', 'previews')
    const target = join(directory, `${digest}${extension}`)
    try {
      await statFile(target)
      return target
    } catch {
      // The preview has not been published yet.
    }
    try {
      await mkdir(directory, { recursive: true })
      try {
        await link(hostPath, target)
      } catch {
        await copyFile(hostPath, target)
      }
      void this.prunePreviews().catch(() => {})
      return target
    } catch {
      return undefined
    }
  }

  /** Keep the image preview link directory bounded without deleting active entries often. */
  async prunePreviews() {
    const now = Date.now()
    if (now - this.lastPreviewPrune < PREVIEW_PRUNE_INTERVAL_MS) return
    this.lastPreviewPrune = now
    const directory = join(this.store.home, 'file-launcher', 'previews')
    try {
      const names = await readdir(directory)
      if (names.length <= PREVIEW_CACHE_MAX_FILES) return
      const entries = (await mapLimit(names, 8, async name => {
        const path = join(directory, name)
        try {
          const info = await statFile(path)
          return info.isFile() ? { path, at: info.mtimeMs } : undefined
        } catch {
          return undefined
        }
      })).filter(Boolean)
      entries.sort((left, right) => right.at - left.at)
      const stale = entries.slice(PREVIEW_CACHE_MAX_FILES)
      await mapLimit(stale, 8, entry => unlink(entry.path).catch(() => {}))
    } catch {
      // Best-effort cache cleanup only.
    }
  }

  /**
   * Scan the Session workspace for readable documents, skipping build output
   * and metadata directories.
   * @param cwd - workspace root.
   * @param signal - cancellation.
   * @returns rows and truncation state.
   */
  async scanWorkspace(cwd, signal, fresh = false) {
    if (typeof cwd !== 'string' || cwd.length === 0) return { rows: [], truncated: false }
    const cacheKey = pathKey(cwd, CASE_INSENSITIVE_PATHS)
    const cached = fresh ? undefined : this.workspaceCache.get(cacheKey)
    if (cached !== undefined && Date.now() - cached.at < 10_000) return cached.value
    const fs = this.fs()
    const collectLimit = Math.max(WORKSPACE_MAX_FILES, 6000)
    const pending = []
    let truncated = false
    let usedLocalFastPath = false
    try {
      const rootTarget = await fs.resolve(cwd, { signal })
      const rootProviderEntries = await fs.listDir(rootTarget)
      let localRootEntries
      try {
        const rootStat = await statFile(cwd)
        if (rootStat.isDirectory()) {
          const diskEntries = await readdir(cwd, { withFileTypes: true })
          const providerNames = new Set(rootProviderEntries.map(e => e.name))
          const diskNames = new Set(diskEntries.map(e => e.name))
          if (providerNames.size === diskNames.size && [...providerNames].every(n => diskNames.has(n))) {
            localRootEntries = diskEntries
          }
        }
      } catch {
        localRootEntries = undefined
      }

      if (localRootEntries !== undefined) {
        usedLocalFastPath = true
        this.watchWorkspaceRoot(cacheKey, cwd)
        const dirQueue = [{ path: cwd, depth: 0, preloaded: localRootEntries }]
        let inFlight = 0
        const waiters = []
        const wakeWaiters = () => {
          while (waiters.length > 0) waiters.shift()()
        }
        const waitForWork = () => new Promise(resolve => waiters.push(resolve))
        const runLocalWorker = async () => {
          while (pending.length < collectLimit) {
            signal?.throwIfAborted()
            const current = dirQueue.shift()
            if (current === undefined) {
              if (inFlight === 0) break
              await raceWithAbort(waitForWork(), signal)
              continue
            }
            inFlight += 1
            let entries
            try {
              entries = current.preloaded ?? await readdir(current.path, { withFileTypes: true })
            } catch {
              inFlight -= 1
              wakeWaiters()
              continue
            }
            try {
              for (const dirent of entries) {
                signal?.throwIfAborted()
                const name = dirent.name
                if (name.startsWith('.')) continue
                const childPath = join(current.path, name)
                if (dirent.isDirectory()) {
                  if (current.depth >= WORKSPACE_MAX_DEPTH) continue
                  if (SKIP_NAMES.has(name.toLowerCase())) continue
                  dirQueue.push({ path: childPath, depth: current.depth + 1 })
                  continue
                }
                if (!dirent.isFile()) continue
                const category = categoryOf(name)
                if (!WORKSPACE_CATEGORIES.has(category)) continue
                if (pending.length >= collectLimit) {
                  truncated = true
                  return
                }
                pending.push({ path: childPath, name, category, local: true })
              }
            } finally {
              inFlight -= 1
              wakeWaiters()
            }
          }
        }
        try {
          await Promise.all(Array.from({ length: 16 }, () => runLocalWorker()))
        } finally {
          wakeWaiters()
        }
      } else {
        const queue = [{ target: rootTarget, depth: 0, preloaded: rootProviderEntries }]
        const workerCount = 8
        let inFlight = 0
        const waiters = []
        const wakeWaiters = () => {
          while (waiters.length > 0) waiters.shift()()
        }
        const waitForWork = () => new Promise(resolve => waiters.push(resolve))
        const runWorker = async () => {
          while (pending.length < collectLimit) {
            signal?.throwIfAborted()
            const current = queue.shift()
            if (current === undefined) {
              if (inFlight === 0) break
              await raceWithAbort(waitForWork(), signal)
              continue
            }
            inFlight += 1
            let entries
            try {
              entries = current.preloaded ?? await fs.listDir(current.target)
            } catch {
              inFlight -= 1
              wakeWaiters()
              continue
            }
            try {
              for (const entry of entries) {
                signal?.throwIfAborted()
                if (entry.type === 'directory') {
                  if (current.depth >= WORKSPACE_MAX_DEPTH) continue
                  if (entry.name.startsWith('.')) continue
                  if (SKIP_NAMES.has(entry.name.toLowerCase())) continue
                  queue.push({ target: entry.target, depth: current.depth + 1 })
                  continue
                }
                if (entry.type !== 'file') continue
                if (entry.name.startsWith('.')) continue
                const category = categoryOf(entry.name)
                if (!WORKSPACE_CATEGORIES.has(category)) continue
                if (pending.length >= collectLimit) {
                  truncated = true
                  return
                }
                let path
                try {
                  path = fs.processPath(entry.target)
                } catch {
                  continue
                }
                pending.push({ entry, path, name: entry.name, category, local: false })
              }
            } finally {
              inFlight -= 1
              wakeWaiters()
            }
          }
        }
        try {
          await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
        } finally {
          wakeWaiters()
        }
      }
    } catch (caught) {
      if (caught && caught.name === 'AbortError') throw caught
      return { rows: [], truncated }
    }

    const statConcurrency = usedLocalFastPath ? 24 : 16
    const allRows = (await mapLimit(pending, statConcurrency, async item => {
      signal?.throwIfAborted()
      if (item.local) {
        let info
        try {
          info = await statFile(item.path)
        } catch {
          return undefined
        }
        return {
          path: item.path,
          rel: displayPath(item.path, cwd),
          name: item.name,
          ext: extensionOfName(item.name),
          category: item.category,
          source: 'workspace',
          size: info.size,
          mtime: info.mtimeMs,
          ...(typeof cwd === 'string' ? { cwd } : {}),
        }
      }
      const inlineMtime = epoch(item.entry.mtimeMs ?? item.entry.mtime ?? item.entry.modifiedAt)
      const mtime = inlineMtime ?? await modificationTime(item.path)
      return {
        path: item.path,
        rel: displayPath(item.path, cwd),
        name: item.name,
        ext: extensionOfName(item.name),
        category: item.category,
        source: 'workspace',
        ...(item.entry.size === undefined ? {} : { size: item.entry.size }),
        ...(mtime === undefined ? {} : { mtime }),
        ...(typeof cwd === 'string' ? { cwd } : {}),
      }
    })).filter(Boolean)

    // Always sort by most recently modified first before applying the workspace cap so
    // newly created files and deliverables are never truncated behind huge build/code trees.
    allRows.sort((left, right) => {
      const mtimeDiff = (right.mtime ?? 0) - (left.mtime ?? 0)
      if (mtimeDiff !== 0) return mtimeDiff
      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    })
    if (allRows.length > WORKSPACE_MAX_FILES) {
      truncated = true
    }
    const rows = allRows.slice(0, WORKSPACE_MAX_FILES)
    const result = { rows, truncated }
    this.workspaceCache.delete(cacheKey)
    this.workspaceCache.set(cacheKey, { at: Date.now(), value: result })
    while (this.workspaceCache.size > WORKSPACE_CACHE_LIMIT) {
      this.workspaceCache.delete(this.workspaceCache.keys().next().value)
    }
    return result
  }

  /**
   * Verify one path through the composed filesystem and return its canonical
   * process path. A relative path resolves against the Session workspace root.
   * @param rawPath - user- or log-supplied path.
   * @param options - workspace root and cancellation.
   * @returns canonical path and size, or undefined for a missing/non-file path.
   */
  async verifyFile(rawPath, { cwd, signal } = {}) {
    const fs = this.fs()
    try {
      const target = await fs.resolve(rawPath, { cwd, signal })
      const information = await fs.stat(target, signal)
      if (information === undefined || information.type !== 'file') return undefined
      const path = fs.processPath(target)
      return { path, size: information.size }
    } catch {
      return undefined
    }
  }

  /**
   * Verify a user-supplied path as a directory for an Explorer entry.
   * @param rawPath - absolute or relative folder path.
   * @param options - workspace root and cancellation.
   * @returns canonical path, or undefined.
   */
  async verifyDirectory(rawPath, { cwd, signal } = {}) {
    const fs = this.fs()
    try {
      const target = await fs.resolve(rawPath, { cwd, signal })
      const information = await fs.stat(target, signal)
      if (information === undefined || information.type !== 'directory') return undefined
      return { path: fs.processPath(target) }
    } catch {
      return undefined
    }
  }

  /**
   * Recent top-level Sessions with their workspace and folded title.
   * @param limit - maximum rows.
   * @param signal - cancellation.
   * @returns newest first.
   */
  async listSessions(limit = 40, signal) {
    const sessionQuery = this.sessionQuery()
    const records = await sessionQuery.listSessions(signal)
    const filtered = records
      .filter(record => record.header?.origin !== 'subagent')
      .sort((left, right) => (right.header?.createdAt ?? 0) - (left.header?.createdAt ?? 0))
      .slice(0, Math.max(1, Math.min(limit, 100)))
    let titles = []
    try {
      titles = await sessionQuery.readTitleSnapshots(filtered.map(record => record.header.id), signal)
    } catch {
      titles = []
    }
    const byId = new Map()
    for (const result of titles) {
      if (result.status === 'fulfilled') byId.set(result.sessionId, result.value.title?.title)
    }
    return filtered.map(record => ({
      id: record.header.id,
      cwd: record.header.cwd,
      createdAt: record.header.createdAt,
      ...(byId.get(record.header.id) === undefined ? {} : { title: byId.get(record.header.id) }),
      live: record.live === true,
    }))
  }

  /**
   * Resolve and verify several user-supplied paths (pin, archive, native
   * open). Relative paths use the given workspace root.
   * @param paths - absolute or relative paths.
   * @param cwd - workspace root.
   * @param signal - cancellation.
   * @returns verified and rejected records.
   */
  async resolvePaths(paths, cwd, signal) {
    const verified = []
    const rejected = []
    for (const raw of paths) {
      signal?.throwIfAborted()
      const resolved = await this.verifyFile(raw, { cwd, signal })
      if (resolved === undefined) rejected.push({ path: raw, reason: 'not a readable regular file' })
      else verified.push(resolved)
    }
    return { verified, rejected }
  }
}

/** Workspace names skipped by the scan (lowercase). */
const SKIP_NAMES = new Set([
  '.git', '.hg', '.svn', '.next', '.nuxt', '.output', '.pnpm-store', '.turbo', '.yarn', '.svelte-kit',
  '.pytest_cache', '.mypy_cache', '.ruff_cache', '.gradle', '.idea', '.vscode', '.cache', '.parcel-cache',
  'node_modules', 'dist', 'build', 'out', 'coverage', '__pycache__', '.venv', 'venv', '.venv3', 'venv3',
  'env', 'site-packages', 'target', 'obj', 'bin', 'vendor', 'pods', 'bower_components', 'logs', 'tmp',
  'temp', 'cache', 'artifacts', '__generated__', 'system volume information', '$recycle.bin', 'thumbs.db',
])

/** Lowercase extension including the dot. */
function extensionOfName(name) {
  const normalized = slashPath(name)
  const base = normalized.slice(normalized.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot).toLowerCase() : ''
}

/** File suffix for one normalized image media type. */
function imageExtension(mediaType) {
  switch (mediaType) {
    case 'image/png': return '.png'
    case 'image/jpeg': return '.jpg'
    case 'image/webp': return '.webp'
    case 'image/gif': return '.gif'
    default: return ''
  }
}
