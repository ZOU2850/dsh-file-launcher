/**
 * Durable File Launcher data: the user's pinned-file manifest and the archive
 * copy operation. Both live outside the Session log on purpose: pins must
 * survive context compaction and Session deletion, and archived bytes are a
 * user-owned copy, not Session content.
 */

import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { constants, existsSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { pathKey, baseName, CASE_INSENSITIVE_PATHS } from './util.js'

/** Manifest schema version written by this plugin. */
const PINS_VERSION = 1

/** Editable preferences with safe defaults. */
export const DEFAULT_SETTINGS = Object.freeze({
  autoRefresh: true,
  refreshSeconds: 60,
  defaultScope: 'session',
  collapseGroups: true,
  pdfMaxPages: 20,
  pdfDpi: 110,
  maxRows: 800,
  appearanceTheme: 'host',
  archiveDir: '',
})

/** Atomically write a UTF-8 file with a collision-free temporary sibling. */
async function atomicWriteUtf8(filePath, content) {
  await mkdir(dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.tmp`
  try {
    await writeFile(temporary, content, 'utf8')
    await rename(temporary, filePath)
  } catch (error) {
    await unlink(temporary).catch(() => {})
    throw error
  }
}

/** Bound and normalize one user preference object. */
function normalizeSettings(value) {
  const source = typeof value === 'object' && value !== null ? value : {}
  const seconds = Number(source.refreshSeconds)
  const rows = Number(source.maxRows)
  const pages = Number(source.pdfMaxPages)
  const dpi = Number(source.pdfDpi)
  const rawArchiveDir = typeof source.archiveDir === 'string' ? source.archiveDir.trim().slice(0, 512) : ''
  const archiveDir = rawArchiveDir.length > 0 && isAbsolute(rawArchiveDir) ? resolve(rawArchiveDir) : ''
  return {
    autoRefresh: typeof source.autoRefresh === 'boolean' ? source.autoRefresh : DEFAULT_SETTINGS.autoRefresh,
    refreshSeconds: Number.isFinite(seconds) ? Math.max(5, Math.min(300, Math.trunc(seconds))) : DEFAULT_SETTINGS.refreshSeconds,
    defaultScope: source.defaultScope === 'sent' || source.defaultScope === 'project' ? source.defaultScope : 'session',
    collapseGroups: typeof source.collapseGroups === 'boolean' ? source.collapseGroups : DEFAULT_SETTINGS.collapseGroups,
    pdfMaxPages: Number.isFinite(pages) ? Math.max(1, Math.min(40, Math.trunc(pages))) : DEFAULT_SETTINGS.pdfMaxPages,
    pdfDpi: Number.isFinite(dpi) ? Math.max(80, Math.min(160, Math.trunc(dpi))) : DEFAULT_SETTINGS.pdfDpi,
    maxRows: Number.isFinite(rows) ? Math.max(100, Math.min(2000, Math.trunc(rows))) : DEFAULT_SETTINGS.maxRows,
    appearanceTheme: ['host', 'system', 'light', 'dark'].includes(source.appearanceTheme) ? source.appearanceTheme : DEFAULT_SETTINGS.appearanceTheme,
    archiveDir,
  }
}

/**
 * Resolve the DeepSeek Harness home the same way the rest of the product does:
 * an explicit `$DSH_HOME`, else `~/.dsh`.
 * @returns the absolute home directory.
 */
export function resolveDshHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim().length > 0) return configured.trim()
  return join(homedir(), '.dsh')
}

/**
 * Base directory for archived copies.
 * `$DSH_FILE_LAUNCHER_ARCHIVE_DIR` wins, then an explicit configured directory
 * from settings, then the user's Documents directory.
 * @param configuredDir - optional explicit absolute directory from plugin settings.
 * @returns the absolute archive root.
 */
export function resolveArchiveRoot(configuredDir = '') {
  const fromEnv = process.env.DSH_FILE_LAUNCHER_ARCHIVE_DIR
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return resolve(fromEnv.trim())
  if (typeof configuredDir === 'string' && configuredDir.trim().length > 0 && isAbsolute(configuredDir.trim())) {
    return resolve(configuredDir.trim())
  }
  return join(homedir(), 'Documents', 'DeepSeekHarnessFileLauncher', 'Archived_Docs')
}

/** Read and validate one persisted pin. */
function normalizePin(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const path = typeof value.path === 'string' && value.path.trim().length > 0 ? value.path.trim() : undefined
  if (path === undefined) return undefined
  return {
    path,
    name: typeof value.name === 'string' && value.name.length > 0 ? value.name : baseName(path),
    ...(typeof value.sessionId === 'string' && value.sessionId.length > 0 ? { sessionId: value.sessionId } : {}),
    ...(typeof value.cwd === 'string' && value.cwd.length > 0 ? { cwd: value.cwd } : {}),
    ...(typeof value.description === 'string' && value.description.length > 0 ? { description: value.description } : {}),
    ...(typeof value.addedAt === 'number' && Number.isFinite(value.addedAt) ? { addedAt: value.addedAt } : { addedAt: Date.now() }),
  }
}

/** Durable pin and archive storage. */
export class FileLauncherStore {
  /**
   * @param ctx - Host context; `fs` is used to resolve archive sources when present.
   */
  constructor(ctx) {
    this.ctx = ctx
    this.home = resolveDshHome()
    this.directory = join(this.home, 'file-launcher')
    this.manifestPath = join(this.directory, 'pins.json')
    this.archiveManifestPath = join(this.directory, 'archive.json')
    this.sentIndexPath = join(this.directory, 'sent-index.json')
    this.deletedPath = join(this.directory, 'deleted.json')
    this.settingsPath = join(this.directory, 'settings.json')
    this.archiveRoot = resolveArchiveRoot()
    this.cache = undefined
    this.archiveCache = undefined
    this.sentIndexCache = undefined
    this.deletedCache = undefined
    this.settingsCache = undefined
    this.writeQueues = new Map()
  }

  /** Serialize read-modify-write mutations per manifest key. */
  enqueue(key, task) {
    const previous = this.writeQueues.get(key) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(task)
    const settled = next.then(() => undefined, () => undefined).finally(() => {
      if (this.writeQueues.get(key) === settled) this.writeQueues.delete(key)
    })
    this.writeQueues.set(key, settled)
    return next
  }

  /** Effective archive root directory, updated when settings change. */
  async effectiveArchiveRoot() {
    const settings = await this.readSettings()
    this.archiveRoot = resolveArchiveRoot(settings.archiveDir)
    return this.archiveRoot
  }

  /** Absolute path of the pin manifest. */
  get manifestFile() {
    return this.manifestPath
  }

  /** Read editable preferences, filling missing fields with defaults. */
  async readSettings() {
    if (this.settingsCache !== undefined) return this.settingsCache
    try {
      const parsed = JSON.parse(await readFile(this.settingsPath, 'utf8'))
      this.settingsCache = normalizeSettings(parsed)
    } catch {
      this.settingsCache = { ...DEFAULT_SETTINGS }
    }
    this.archiveRoot = resolveArchiveRoot(this.settingsCache.archiveDir)
    return this.settingsCache
  }

  /** Persist one validated preferences object atomically. */
  async writeSettings(value) {
    return this.enqueue('settings', async () => {
      const normalized = normalizeSettings(value)
      await atomicWriteUtf8(this.settingsPath, `${JSON.stringify(normalized, null, 2)}\n`)
      this.settingsCache = normalized
      this.archiveRoot = resolveArchiveRoot(normalized.archiveDir)
      return normalized
    })
  }

  /** Record paths deleted through the plugin so they do not return as ghosts. */
  async recordDeleted(paths) {
    return this.enqueue('deleted', async () => {
      const set = await this.readDeleted()
      let changed = false
      for (const path of paths) {
        const key = pathKey(path, CASE_INSENSITIVE_PATHS)
        if (!set.has(key)) {
          set.add(key)
          changed = true
        }
      }
      if (changed) {
        await atomicWriteUtf8(this.deletedPath, `${JSON.stringify({ version: PINS_VERSION, paths: [...set] })}\n`)
      }
      return set
    })
  }

  /** Clear deletion tombstones when a file reappears on disk or is newly sent. */
  async clearDeleted(paths) {
    if (!Array.isArray(paths) || paths.length === 0) return this.readDeleted()
    return this.enqueue('deleted', async () => {
      const set = await this.readDeleted()
      let changed = false
      for (const path of paths) {
        const key = pathKey(path, CASE_INSENSITIVE_PATHS)
        if (set.delete(key)) changed = true
      }
      if (changed) {
        await atomicWriteUtf8(this.deletedPath, `${JSON.stringify({ version: PINS_VERSION, paths: [...set] })}\n`)
      }
      return set
    })
  }

  /** Paths explicitly deleted through the plugin; suppress their ghost rows. */
  async readDeleted() {
    if (this.deletedCache !== undefined) return this.deletedCache
    try {
      const parsed = JSON.parse(await readFile(this.deletedPath, 'utf8'))
      const paths = Array.isArray(parsed?.paths) ? parsed.paths.filter(path => typeof path === 'string') : []
      this.deletedCache = new Set(paths.map(path => pathKey(path, CASE_INSENSITIVE_PATHS)))
    } catch {
      this.deletedCache = new Set()
    }
    return this.deletedCache
  }

  /** Whether a path was explicitly deleted through this plugin. */
  async isDeleted(path) {
    return (await this.readDeleted()).has(pathKey(path, CASE_INSENSITIVE_PATHS))
  }

  /**
   * Read the persisted cross-conversation user-file index. A missing or broken
   * index is an empty list, not an error: the next scan rebuilds it.
   * @returns cached rows and their update time.
   */
  async readSentIndex() {
    if (this.sentIndexCache !== undefined) return this.sentIndexCache
    try {
      const text = await readFile(this.sentIndexPath, 'utf8')
      const parsed = JSON.parse(text)
      const rows = Array.isArray(parsed?.rows)
        ? parsed.rows.filter(row => row && typeof row === 'object' && typeof row.path === 'string')
        : []
      this.sentIndexCache = {
        updatedAt: typeof parsed?.updatedAt === 'number' ? parsed.updatedAt : 0,
        rows,
      }
      return this.sentIndexCache
    } catch {
      this.sentIndexCache = { updatedAt: 0, rows: [] }
      return this.sentIndexCache
    }
  }

  /**
   * Persist the cross-conversation user-file index atomically.
   * @param rows - verified attachment rows with session/project labels.
   * @returns the written index.
   */
  async writeSentIndex(rows) {
    return this.enqueue('sent-index', async () => {
      const manifest = { version: PINS_VERSION, updatedAt: Date.now(), rows }
      await atomicWriteUtf8(this.sentIndexPath, `${JSON.stringify(manifest)}\n`)
      this.sentIndexCache = manifest
      return manifest
    })
  }

  /**
   * Read the pin manifest. A missing manifest is an empty list; malformed
   * content is retained on disk and reported as empty instead of being
   * overwritten silently.
   * @returns the manifest and whether it was readable.
   */
  async readPins() {
    if (this.cache !== undefined) return this.cache
    let text
    try {
      text = await readFile(this.manifestPath, 'utf8')
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        this.cache = { version: PINS_VERSION, updatedAt: 0, pins: [], readable: true }
        return this.cache
      }
      this.cache = { version: PINS_VERSION, updatedAt: 0, pins: [], readable: false }
      return this.cache
    }
    try {
      const parsed = JSON.parse(text)
      if (!parsed || !Array.isArray(parsed.pins) || (parsed.version !== undefined && parsed.version !== PINS_VERSION)) {
        throw new Error('Unrecognized pin manifest')
      }
      const rawPins = parsed.pins
      const unique = new Map()
      for (const raw of rawPins) {
        const pin = normalizePin(raw)
        if (pin === undefined) continue
        const key = pathKey(pin.path, CASE_INSENSITIVE_PATHS)
        if (!unique.has(key)) unique.set(key, pin)
      }
      const pins = [...unique.values()].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
      this.cache = {
        version: PINS_VERSION,
        updatedAt: typeof parsed?.updatedAt === 'number' ? parsed.updatedAt : 0,
        pins,
        readable: true,
      }
      return this.cache
    } catch {
      this.cache = { version: PINS_VERSION, updatedAt: 0, pins: [], readable: false }
      return this.cache
    }
  }

  /** Internal unlocked pin manifest write; must run inside the `pins` queue. */
  async writePinsLocked(pins) {
    if ((await this.readPins()).readable === false) throw new Error('The pin manifest is unreadable; repair it before changing pins.')
    const manifest = {
      version: PINS_VERSION,
      updatedAt: Date.now(),
      pins: pins.map(pin => ({
        path: pin.path,
        name: pin.name,
        ...(pin.sessionId === undefined ? {} : { sessionId: pin.sessionId }),
        ...(pin.cwd === undefined ? {} : { cwd: pin.cwd }),
        ...(pin.description === undefined ? {} : { description: pin.description }),
        addedAt: pin.addedAt,
      })),
    }
    await atomicWriteUtf8(this.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    this.cache = { ...manifest, readable: true }
    return this.cache
  }

  /** Persist one manifest atomically (temporary file then rename). */
  async writePins(pins) {
    return this.enqueue('pins', () => this.writePinsLocked(pins))
  }

  /**
   * Pin one or more verified files.
   * @param entries - absolute path, optional session/cwd/description per file.
   * @returns the complete pin list after the update.
   */
  async addPins(entries) {
    return this.enqueue('pins', async () => {
      const current = await this.readPins()
      const byKey = new Map(current.pins.map(pin => [pathKey(pin.path, CASE_INSENSITIVE_PATHS), pin]))
      for (const entry of entries) {
        const pin = normalizePin({
          path: entry.path,
          name: entry.name ?? baseName(entry.path),
          sessionId: entry.sessionId,
          cwd: entry.cwd,
          description: entry.description,
          addedAt: Date.now(),
        })
        if (pin === undefined) continue
        const key = pathKey(pin.path, CASE_INSENSITIVE_PATHS)
        const previous = byKey.get(key)
        byKey.set(key, previous === undefined ? pin : { ...previous, ...pin, addedAt: previous.addedAt })
      }
      const pins = [...byKey.values()].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
      return this.writePinsLocked(pins)
    })
  }

  /**
   * Remove pins by path.
   * @param paths - paths to unpin.
   * @returns the complete pin list after the update.
   */
  async removePins(paths) {
    return this.enqueue('pins', async () => {
      const current = await this.readPins()
      const remove = new Set(paths.map(path => pathKey(path, CASE_INSENSITIVE_PATHS)))
      const pins = current.pins.filter(pin => !remove.has(pathKey(pin.path, CASE_INSENSITIVE_PATHS)))
      if (pins.length === current.pins.length) return current
      return this.writePinsLocked(pins)
    })
  }

  /** Remove every pin. */
  async clearPins() {
    return this.enqueue('pins', () => this.writePinsLocked([]))
  }

  /**
   * Read the archive manifest: one record per source path last copied.
   * @returns records and readability, newest first.
   */
  async readArchive() {
    if (this.archiveCache !== undefined) return this.archiveCache
    let text
    try {
      text = await readFile(this.archiveManifestPath, 'utf8')
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        this.archiveCache = { version: PINS_VERSION, updatedAt: 0, records: [], readable: true }
        return this.archiveCache
      }
      this.archiveCache = { version: PINS_VERSION, updatedAt: 0, records: [], readable: false }
      return this.archiveCache
    }
    try {
      const parsed = JSON.parse(text)
      if (!parsed || !Array.isArray(parsed.records) || (parsed.version !== undefined && parsed.version !== PINS_VERSION)) {
        throw new Error('Unrecognized archive manifest')
      }
      const rawRecords = parsed.records
      const records = []
      for (const raw of rawRecords) {
        if (typeof raw !== 'object' || raw === null) continue
        const sourcePath = typeof raw.sourcePath === 'string' && raw.sourcePath.length > 0 ? raw.sourcePath : undefined
        const archivePath = typeof raw.archivePath === 'string' && raw.archivePath.length > 0 ? raw.archivePath : undefined
        if (sourcePath === undefined || archivePath === undefined) continue
        records.push({
          sourcePath,
          archivePath,
          archivedAt: typeof raw.archivedAt === 'number' && Number.isFinite(raw.archivedAt) ? raw.archivedAt : 0,
        })
      }
      records.sort((left, right) => right.archivedAt - left.archivedAt)
      this.archiveCache = {
        version: PINS_VERSION,
        updatedAt: typeof parsed?.updatedAt === 'number' ? parsed.updatedAt : 0,
        records,
        readable: true,
      }
      return this.archiveCache
    } catch {
      this.archiveCache = { version: PINS_VERSION, updatedAt: 0, records: [], readable: false }
      return this.archiveCache
    }
  }

  /** Internal unlocked archive manifest write; must run inside the `archive` queue. */
  async writeArchiveLocked(records) {
    if ((await this.readArchive()).readable === false) throw new Error('The archive manifest is unreadable; repair it before changing archive records.')
    const manifest = {
      version: PINS_VERSION,
      updatedAt: Date.now(),
      records: records.map(record => ({
        sourcePath: record.sourcePath,
        archivePath: record.archivePath,
        archivedAt: record.archivedAt,
      })),
    }
    await atomicWriteUtf8(this.archiveManifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    this.archiveCache = { ...manifest, readable: true }
    return this.archiveCache
  }

  /** Persist the archive manifest atomically. */
  async writeArchive(records) {
    return this.enqueue('archive', () => this.writeArchiveLocked(records))
  }

  /**
   * Record one successful copy for each source path. The source file is not
   * touched: archive is a copy, never a move.
   * @param copied - source → archive destination pairs.
   * @returns the updated archive manifest.
   */
  async recordArchive(copied) {
    if (copied.length === 0) return this.readArchive()
    return this.enqueue('archive', async () => {
      const current = await this.readArchive()
      const byKey = new Map(current.records.map(record => [pathKey(record.sourcePath, CASE_INSENSITIVE_PATHS), record]))
      const archivedAt = Date.now()
      for (const entry of copied) {
        const key = pathKey(entry.from, CASE_INSENSITIVE_PATHS)
        byKey.set(key, { sourcePath: entry.from, archivePath: entry.to, archivedAt })
      }
      const records = [...byKey.values()].sort((left, right) => right.archivedAt - left.archivedAt)
      return this.writeArchiveLocked(records)
    })
  }

  /**
   * Forget archive records for the given source paths. The copies themselves
   * are left in the dated folders; only the badge manifest changes.
   * @param paths - source paths that no longer exist.
   * @returns the updated archive manifest.
   */
  async removeArchive(paths) {
    if (paths.length === 0) return this.readArchive()
    return this.enqueue('archive', async () => {
      const current = await this.readArchive()
      const remove = new Set(paths.map(path => pathKey(path, CASE_INSENSITIVE_PATHS)))
      const records = current.records.filter(record => !remove.has(pathKey(record.sourcePath, CASE_INSENSITIVE_PATHS)))
      if (records.length === current.records.length) return current
      return this.writeArchiveLocked(records)
    })
  }

  /**
   * Copy files into a dated archive folder. A name collision gains a numeric
   * suffix instead of replacing an earlier archive.
   * @param paths - absolute source files, already verified by the caller.
   * @param signal - cancellation for the copy batch.
   * @returns copied and failed records plus the dated directory.
   */
  async archive(paths, signal) {
    const archiveRoot = await this.effectiveArchiveRoot()
    const stamp = new Date()
    const date = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(stamp.getDate()).padStart(2, '0')}`
    const directory = join(archiveRoot, date)
    await mkdir(directory, { recursive: true })
    const copied = []
    const failed = []
    for (const source of paths) {
      signal?.throwIfAborted()
      try {
        const information = await stat(source)
        if (!information.isFile()) throw new Error('not a regular file')
        const name = baseName(source)
        const extension = extname(name)
        const stem = extension.length > 0 ? name.slice(0, -extension.length) : name
        let target
        for (let index = 1; index <= 999; index += 1) {
          const candidate = join(directory, index === 1 ? name : `${stem} (${index})${extension}`)
          if (pathKey(candidate, CASE_INSENSITIVE_PATHS) === pathKey(source, CASE_INSENSITIVE_PATHS)) {
            throw new Error('source is already in the archive')
          }
          signal?.throwIfAborted()
          try {
            await copyFile(source, candidate, constants.COPYFILE_EXCL)
            target = candidate
            break
          } catch (error) {
            if (error?.code !== 'EEXIST') throw error
          }
        }
        if (target === undefined) throw new Error(`too many archive name collisions for ${name}`)
        copied.push({ from: source, to: target })
      } catch (error) {
        failed.push({ path: source, message: error instanceof Error ? error.message : String(error) })
      }
    }
    try {
      await this.recordArchive(copied)
    } catch {
      // The copy succeeded; a manifest failure only affects the archived badge.
    }
    return { archiveDir: directory, copied, failed }
  }

  /** Choose a non-existing archive target, adding ` (2)`, ` (3)`, ... before the extension. */
  async uniqueTarget(directory, name) {
    const extension = extname(name)
    const stem = extension.length > 0 ? name.slice(0, -extension.length) : name
    let candidate = join(directory, name)
    let index = 2
    while (existsSync(candidate)) {
      if (index > 999) throw new Error(`too many archive name collisions for ${name}`)
      candidate = join(directory, `${stem} (${index})${extension}`)
      index += 1
    }
    return candidate
  }
}
