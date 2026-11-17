/**
 * Authenticated Fetch routes for the File Launcher panel. Every route is
 * registered through Connection's exact-route registry, so the Host/Origin
 * fence and the browser login cookie gate it before a handler runs.
 */

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { LocalAppDetector } from './apps.js'
import { baseName, isInsideWorkspace } from './util.js'

/** Route prefixes; all are absolute paths below `/api`. */
export const ROUTES = {
  health: '/api/file-launcher.health',
  inventory: '/api/file-launcher.inventory',
  pins: '/api/file-launcher.pins',
  archive: '/api/file-launcher.archive',
  apps: '/api/file-launcher.apps',
  openApp: '/api/file-launcher.open-app',
  openAs: '/api/file-launcher.open-as',
  openFolder: '/api/file-launcher.open-folder',
  forget: '/api/file-launcher.forget',
  delete: '/api/file-launcher.delete',
  pdfPages: '/api/file-launcher.pdf-pages',
  pdfImage: '/api/file-launcher.pdf-image',
  settings: '/api/file-launcher.settings',
  sessions: '/api/file-launcher.sessions',
}

/** Latest response cap for one pins/archive request. */
const MAX_PATHS = 500

/** Drop old rendered-page directories; their URLs only matter while a preview is open. */
async function pruneRenders(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    const dirs = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const path = join(root, entry.name)
      try {
        dirs.push({ path, at: (await stat(path)).mtimeMs })
      } catch {}
    }
    dirs.sort((left, right) => right.at - left.at)
    const cutoff = Date.now() - 60 * 60 * 1000
    await Promise.all(dirs.slice(20).map(dir => rm(dir.path, { recursive: true, force: true })))
    await Promise.all(dirs.slice(0, 20).filter(dir => dir.at < cutoff).map(dir => rm(dir.path, { recursive: true, force: true })))
  } catch {
    // Pruning is best effort; a preview must never fail because cleanup did.
  }
}

/** JSON response with no-store caching. */
function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } })
}

/** Read a JSON object body, bounded by the connection's buffered request cap. */
async function readObject(request) {
  let value
  try {
    value = await request.json()
  } catch {
    throw new HttpError(400, 'The request body must be JSON.')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'The request body must be a JSON object.')
  }
  return value
}

/** One client-facing handler failure with its HTTP status. */
class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** Run one local PDF utility with cancellation and timeout guards. */
function runPdfTool(command, args, { signal, timeoutMs = 45_000 } = {}) {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'))
  }
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer)
      if (signal !== undefined) signal.removeEventListener('abort', onAbort)
    }
    const fail = (error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const terminateChild = () => {
      try { child.kill('SIGTERM') } catch {}
      setTimeout(() => {
        try { if (!child.killed) child.kill('SIGKILL') } catch {}
      }, 1500).unref?.()
    }
    const onAbort = () => {
      terminateChild()
      fail(signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'))
    }
    const timer = setTimeout(() => {
      terminateChild()
      fail(new Error(`${command} timed out after ${Math.round(timeoutMs / 1000)}s.`))
    }, timeoutMs)
    if (signal !== undefined) signal.addEventListener('abort', onAbort, { once: true })

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      if (stdout.length < 262_144) stdout += chunk
    })
    child.stderr.on('data', chunk => {
      if (stderr.length < 65_536) stderr += chunk
    })
    child.on('error', fail)
    child.on('close', code => {
      if (settled) return
      settled = true
      cleanup()
      if (code === 0) resolvePromise({ stdout, stderr })
      else reject(new Error(`${command} exited with ${String(code)}: ${stderr.split('\n')[0] || ''}`))
    })
  })
}

/** Require one string query parameter. */
function queryString(url, name, { required = false, fallback } = {}) {
  const value = url.searchParams.get(name)
  if (value === null || value.length === 0) {
    if (required) throw new HttpError(400, `The "${name}" parameter is required.`)
    return fallback
  }
  return value
}

/** Normalize and bound a paths array from a request body. */
function pathsOf(body) {
  if (!Array.isArray(body.paths)) throw new HttpError(400, 'The "paths" array is required.')
  if (body.paths.length === 0) return []
  if (body.paths.length > MAX_PATHS) throw new HttpError(400, `At most ${MAX_PATHS} paths are accepted per call.`)
  const paths = body.paths.map(value => {
    if (typeof value !== 'string') throw new HttpError(400, 'Every path must be a string.')
    return value
  })
  return paths
}

/** Normalize a workspace directory value. */
function cwdOf(body) {
  return typeof body.cwd === 'string' && body.cwd.length > 0 ? body.cwd : undefined
}

/**
 * Register every File Launcher route on the Host context.
 * @param ctx - Host context with `connection`.
 * @param dependencies - inventory service and pin store.
 * @returns a combined route disposer for Cordis lifecycle cleanup.
 */
export function registerRoutes(ctx, { inventory, store, version, apps = new LocalAppDetector() }) {
  const connection = ctx.get('connection')
  if (connection === undefined) return () => {}
  const disposers = []
  const register = (path, methods, handler) => {
    const disposer = connection.fetch.register({
      path,
      methods,
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          return await handler(request)
        } catch (error) {
          const status = error instanceof HttpError ? error.status : 500
          const message = error instanceof Error ? error.message : String(error)
          return json({ ok: false, error: message }, status)
        }
      },
    })
    if (typeof disposer === 'function') disposers.push(disposer)
    else if (disposer && typeof disposer.dispose === 'function') disposers.push(() => disposer.dispose())
    return disposer
  }

  register(ROUTES.health, ['GET'], async () => {
    const pins = await store.readPins()
    const archiveRoot = await store.effectiveArchiveRoot()
    const officeKit = ctx.get('officeKit')
    return json({
      ok: true,
      version,
      home: store.home,
      manifest: store.manifestFile,
      archiveRoot,
      pinCount: pins.pins.length,
      platform: process.platform,
      officeKit: officeKit !== undefined,
      capabilities: {
        apps: true,
        openApp: true,
        officeKit: officeKit !== undefined,
      },
    })
  })

  register(ROUTES.inventory, ['GET'], async (request) => {
    const url = new URL(request.url)
    const scope = queryString(url, 'scope', { fallback: 'session' })
    if (scope !== 'session' && scope !== 'project' && scope !== 'sent') {
      throw new HttpError(400, 'The "scope" parameter must be "session", "project", or "sent".')
    }
    const limit = Number(queryString(url, 'limit', { fallback: '800' }))
    const fresh = queryString(url, 'fresh', { fallback: '' }) === '1'
    if (scope === 'sent') {
      const sessionId = queryString(url, 'sessionId', { fallback: '' })
      const result = await inventory.sentInventory({
        limit,
        signal: request.signal,
        fresh,
        ...(sessionId.length > 0 ? { sessionId } : {}),
      })
      return json(result)
    }
    const sessionId = queryString(url, 'sessionId', { required: true })
    const result = await inventory.inventory({ sessionId, scope, limit, signal: request.signal, fresh })
    return json(result)
  })

  register(ROUTES.settings, ['GET', 'POST'], async (request) => {
    if (request.method === 'GET') {
      const settings = await store.readSettings()
      const archiveRoot = await store.effectiveArchiveRoot()
      return json({
        ok: true,
        settings,
        paths: {
          home: store.home,
          directory: store.directory,
          settings: store.settingsPath,
          sentIndex: store.sentIndexPath,
          archiveRoot,
          defaultArchiveRoot: join(store.home, 'file-launcher'),
        },
      })
    }
    const body = await readObject(request)
    const candidate = typeof body.settings === 'object' && body.settings !== null ? body.settings : body
    const settings = await store.writeSettings(candidate)
    const archiveRoot = await store.effectiveArchiveRoot()
    return json({ ok: true, settings, archiveRoot })
  })

  register(ROUTES.sessions, ['GET'], async (request) => {
    const url = new URL(request.url)
    const limit = Number(queryString(url, 'limit', { fallback: '40' }))
    const sessions = await inventory.listSessions(limit, request.signal)
    return json({ ok: true, sessions })
  })

  register(ROUTES.pins, ['GET', 'POST'], async (request) => {
    if (request.method === 'GET') {
      const manifest = await store.readPins()
      return json({
        ok: manifest.readable,
        pins: manifest.pins,
        updatedAt: manifest.updatedAt,
        ...(manifest.readable ? {} : { error: 'The pin manifest is unreadable; it was not overwritten.' }),
      })
    }
    if (request.method !== 'POST') throw new HttpError(405, 'Only GET and POST are supported.')
    const body = await readObject(request)
    const action = typeof body.action === 'string' ? body.action : 'add'
    if (action === 'clear') {
      const manifest = await store.clearPins()
      return json({ ok: true, pins: manifest.pins, updatedAt: manifest.updatedAt })
    }
    if (action !== 'add' && action !== 'remove') {
      throw new HttpError(400, 'The "action" must be "add", "remove", or "clear".')
    }
    const paths = pathsOf(body)
    const cwd = cwdOf(body)
    if (action === 'remove') {
      const candidates = new Set()
      for (const entry of paths) {
        candidates.add(entry)
        if (cwd && !isAbsolute(entry)) candidates.add(resolve(cwd, entry))
        const resolved = await inventory.verifyFile(entry, { cwd, signal: request.signal })
        if (resolved !== undefined) candidates.add(resolved.path)
      }
      const manifest = await store.removePins([...candidates])
      inventory.invalidateSentCache()
      return json({ ok: true, pins: manifest.pins, updatedAt: manifest.updatedAt })
    }
    const { verified, rejected } = await inventory.resolvePaths(paths, cwd, request.signal)
    const sessionId = typeof body.sessionId === 'string' && body.sessionId.length > 0 ? body.sessionId : undefined
    const manifest = await store.addPins(verified.map(file => ({
      path: file.path,
      name: baseName(file.path),
      sessionId,
      cwd,
      ...(typeof body.description === 'string' && body.description.length > 0 ? { description: body.description } : {}),
    })))
    inventory.invalidateSentCache()
    return json({ ok: true, pins: manifest.pins, updatedAt: manifest.updatedAt, rejected })
  })

  register(ROUTES.archive, ['POST'], async (request) => {
    const body = await readObject(request)
    const paths = pathsOf(body)
    if (paths.length === 0) throw new HttpError(400, 'Select at least one file to archive.')
    const cwd = cwdOf(body)
    const { verified, rejected } = await inventory.resolvePaths(paths, cwd, request.signal)
    const result = await store.archive(verified.map(file => file.path), request.signal)
    inventory.invalidateSentCache()
    return json({
      ok: true,
      archiveDir: result.archiveDir,
      copied: result.copied,
      failed: [...result.failed, ...rejected.map(item => ({ path: item.path, message: item.reason }))],
    })
  })

  register(ROUTES.pdfPages, ['POST'], async (request) => {
    const body = await readObject(request)
    const maxPages = Math.max(1, Math.min(Number(body.maxPages) || 20, 40))
    const dpi = Math.max(80, Math.min(Number(body.dpi) || 110, 160))
    const rawPath = typeof body.path === 'string' ? body.path.trim() : ''
    let pdfPath
    let temporarySource = false
    if (rawPath.length > 0) {
      const resolved = await inventory.verifyFile(rawPath, { cwd: cwdOf(body), signal: request.signal })
      if (resolved === undefined) throw new HttpError(404, 'The PDF file is not readable or no longer exists.')
      if (typeof resolved.size === 'number' && resolved.size > 64 * 1024 * 1024) {
        throw new HttpError(413, 'The PDF is too large to render.')
      }
      pdfPath = resolved.path
    } else if (typeof body.data === 'string' && body.data.length > 0) {
      if (body.data.length > 40_000_000) throw new HttpError(413, 'The PDF is too large to render.')
      let bytes
      try {
        bytes = Buffer.from(body.data, 'base64')
      } catch {
        throw new HttpError(400, 'The "data" field is not valid base64.')
      }
      if (bytes.length === 0) throw new HttpError(400, 'The PDF is empty.')
      temporarySource = true
    } else {
      throw new HttpError(400, 'Either a readable PDF "path" or base64 "data" field is required.')
    }

    const root = join(store.directory, 'renders')
    await mkdir(root, { recursive: true })
    const token = randomUUID()
    const directory = join(root, token)
    await mkdir(directory)
    if (temporarySource) {
      pdfPath = join(directory, 'source.pdf')
      await writeFile(pdfPath, Buffer.from(body.data, 'base64'))
    }
    try {
      let totalPages = 0
      try {
        const info = await runPdfTool('pdfinfo', [pdfPath], { signal: request.signal, timeoutMs: 15_000 })
        const match = /^Pages:\s+(\d+)/m.exec(info.stdout)
        if (match !== null) totalPages = Number(match[1])
      } catch (error) {
        if (request.signal?.aborted) throw error
        totalPages = 0
      }
      const limit = Math.min(maxPages, totalPages > 0 ? totalPages : maxPages)
      await runPdfTool(
        'pdftoppm',
        ['-jpeg', '-r', String(dpi), '-f', '1', '-l', String(limit), pdfPath, join(directory, 'page')],
        { signal: request.signal, timeoutMs: 45_000 },
      )
      const files = (await readdir(directory))
        .filter(name => /^page-\d+\.jpe?g$/i.test(name))
        .sort((left, right) => Number(/\d+/.exec(left)?.[0] || 0) - Number(/\d+/.exec(right)?.[0] || 0))
      if (files.length === 0) throw new HttpError(500, 'PDF page rendering produced no pages.')
      await writeFile(join(directory, 'manifest.json'), JSON.stringify({ pages: files }), 'utf8')
      void pruneRenders(root)
      return json({
        ok: true,
        token,
        totalPages: totalPages > 0 ? totalPages : files.length,
        truncated: (totalPages > 0 ? totalPages : files.length) > files.length,
        pages: files.map((file, index) => ({
          page: index + 1,
          url: `${ROUTES.pdfImage}?token=${encodeURIComponent(token)}&page=${index + 1}`,
        })),
      })
    } catch (error) {
      await rm(directory, { recursive: true, force: true }).catch(() => {})
      if (error instanceof HttpError) throw error
      throw new HttpError(500, error instanceof Error ? error.message : String(error))
    } finally {
      if (temporarySource && pdfPath !== undefined) {
        await unlink(pdfPath).catch(() => {})
      }
    }
  })

  register(ROUTES.pdfImage, ['GET'], async (request) => {
    const url = new URL(request.url)
    const token = url.searchParams.get('token') || ''
    if (!/^[0-9a-f-]{36}$/.test(token)) throw new HttpError(400, 'Invalid render token.')
    const page = Number(url.searchParams.get('page'))
    if (!Number.isInteger(page) || page < 1 || page > 200) throw new HttpError(400, 'Invalid page.')
    const directory = join(store.directory, 'renders', token)
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
    const file = Array.isArray(manifest.pages) ? manifest.pages[page - 1] : undefined
    if (typeof file !== 'string' || !/^page-\d+\.jpe?g$/i.test(file)) throw new HttpError(404, 'Page not found.')
    const bytes = await readFile(join(directory, file))
    return new Response(bytes, {
      status: 200,
      headers: {
        'content-type': 'image/jpeg',
        'cache-control': 'private, max-age=300',
      },
    })
  })

  register(ROUTES.forget, ['POST'], async (request) => {
    const body = await readObject(request)
    const path = typeof body.path === 'string' ? body.path : ''
    if (path.length === 0) throw new HttpError(400, 'The "path" field is required.')
    await store.recordDeleted([path])
    inventory.invalidateSentCache()
    return json({ ok: true, path })
  })

  register(ROUTES.delete, ['POST'], async (request) => {
    const body = await readObject(request)
    if (body.confirm !== true) throw new HttpError(400, 'Deletion requires an explicit confirmation.')
    const path = typeof body.path === 'string' ? body.path : ''
    if (path.length === 0) throw new HttpError(400, 'The "path" field is required.')
    const resolved = await inventory.verifyFile(path, { cwd: cwdOf(body), signal: request.signal })
    if (resolved === undefined) throw new HttpError(404, 'The file is not readable or no longer exists.')
    await unlink(resolved.path)
    const previewPath = typeof body.previewPath === 'string' ? body.previewPath.trim() : ''
    const previewsRoot = join(store.directory, 'previews')
    if (previewPath.length > 0 && isInsideWorkspace(previewPath, previewsRoot) && resolve(previewPath) !== resolve(previewsRoot)) {
      await unlink(previewPath).catch(() => {})
    }
    await store.recordDeleted([resolved.path])
    await store.removePins([resolved.path])
    await store.removeArchive([resolved.path])
    inventory.invalidateSentCache()
    return json({ ok: true, path: resolved.path })
  })

  register(ROUTES.openFolder, ['POST'], async (request) => {
    const body = await readObject(request)
    const path = typeof body.path === 'string' ? body.path : ''
    if (path.length === 0) throw new HttpError(400, 'The "path" field is required.')
    const resolved = await inventory.verifyDirectory(path, { cwd: cwdOf(body), signal: request.signal })
    if (resolved === undefined) throw new HttpError(404, 'The folder is not readable or no longer exists.')
    const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'
    const child = spawn(command, [resolved.path], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.on('error', () => {})
    child.unref()
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  })

  register(ROUTES.openAs, ['POST'], async (request) => {
    const body = await readObject(request)
    const path = typeof body.path === 'string' ? body.path : ''
    if (path.length === 0) throw new HttpError(400, 'The "path" field is required.')
    if (process.platform !== 'win32') {
      throw new HttpError(501, 'The system "Open with" dialog is only available on Windows.')
    }
    const cwd = cwdOf(body)
    const resolved = await inventory.verifyFile(path, { cwd, signal: request.signal })
    if (resolved === undefined) throw new HttpError(404, 'The file is not readable or no longer exists.')
    const child = spawn('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', resolved.path], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.on('error', () => {})
    child.unref()
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  })

  register(ROUTES.apps, ['GET'], async (request) => {
    const url = new URL(request.url)
    const filePath = queryString(url, 'path', { required: true })
    const matched = await apps.matchAppsForPath(filePath)
    return json({ ok: true, path: filePath, apps: matched })
  })

  register(ROUTES.openApp, ['POST'], async (request) => {
    const body = await readObject(request)
    const path = typeof body.path === 'string' ? body.path : ''
    const appId = typeof body.appId === 'string' ? body.appId : ''
    if (path.length === 0) throw new HttpError(400, 'The "path" field is required.')
    if (appId.length === 0) throw new HttpError(400, 'The "appId" field is required.')
    const resolved = await inventory.verifyFile(path, { cwd: cwdOf(body), signal: request.signal })
    if (resolved === undefined) throw new HttpError(404, 'The file is not readable or no longer exists.')
    const launched = await apps.launchWithApp(appId, resolved.path)
    if (!launched) throw new HttpError(404, 'The selected application is not available on this machine.')
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  })

  return () => {
    for (const dispose of disposers.splice(0).reverse()) {
      try {
        dispose()
      } catch {
        // Ignore teardown failures during reload.
      }
    }
  }
}
