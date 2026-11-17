/**
 * Offline checks for the File Launcher host helpers. Run with:
 *   node tests/self-test.mjs
 * These exercise pure path logic, the pin/archive store, and inventory scanning
 * against a mock filesystem; they do not start a Harness.
 */

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  categoryOf, displayPath, extensionOf, pathsFromResultMeta, pathsFromToolArguments,
  referenceText, baseName,
} from '../lib/util.js'
import { FileLauncherStore, resolveArchiveRoot } from '../lib/store.js'
import { InventoryService } from '../lib/inventory.js'
import { registerTool } from '../lib/tool.js'

const root = await mkdtemp(join(tmpdir(), 'dfl-self-test-'))
const home = join(root, 'home')
const archive = join(root, 'archive')
process.env.DSH_HOME = home
process.env.DSH_FILE_LAUNCHER_ARCHIVE_DIR = archive

try {
  /* ── pure helpers ── */
  assert.equal(categoryOf('notes.md'), 'markdown')
  assert.equal(categoryOf('D:\\work\\deck.PPTX'), 'slides')
  assert.equal(extensionOf('archive.tar.gz'), '.gz')
  assert.equal(baseName('C:\\work\\a b.docx'), 'a b.docx')
  assert.equal(displayPath('C:\\work\\sub\\a.md', 'C:\\work'), 'sub/a.md')
  assert.equal(displayPath('C:\\other\\a.md', 'C:\\work'), 'C:/other/a.md')
  assert.equal(referenceText('C:\\work\\sub\\a.md', 'C:\\work'), '@sub/a.md')
  assert.equal(referenceText('C:\\work\\a b.md', 'C:\\work'), '@"a b.md"')
  assert.equal(referenceText('C:\\other\\a.md', 'C:\\work'), '@C:/other/a.md')
  assert.deepEqual(pathsFromToolArguments('write', JSON.stringify({ file_path: 'a.txt', content: 'x' })), ['a.txt'])
  assert.deepEqual(pathsFromToolArguments('present', JSON.stringify({ files: [{ path: 'b.pdf' }] })), ['b.pdf'])
  assert.deepEqual(pathsFromToolArguments('read', JSON.stringify({ file_path: 'c.md' })), ['c.md'])
  assert.deepEqual(pathsFromResultMeta({ path: 'x', diffs: [{ path: 'y' }], locations: [{ path: 'z' }] }), ['x', 'y', 'z'])

  /* ── pin store ── */
  const store = new FileLauncherStore({})
  await store.addPins([{ path: join(root, 'a.docx'), name: 'a.docx', cwd: root, sessionId: 's1' }])
  let pins = await store.readPins()
  assert.equal(pins.readable, true)
  assert.equal(pins.pins.length, 1)
  assert.equal(pins.pins[0].path, join(root, 'a.docx'))
  await store.removePins([join(root, 'a.docx')])
  pins = await store.readPins()
  assert.equal(pins.pins.length, 0)
  await store.clearPins()
  assert.equal((await store.readPins()).pins.length, 0)

  /* ── settings ── */
  const defaultSettings = await store.readSettings()
  assert.equal(defaultSettings.refreshSeconds, 60)
  assert.equal(defaultSettings.defaultScope, 'session')
  const savedSettings = await store.writeSettings({
    autoRefresh: false,
    refreshSeconds: 999,
    defaultScope: 'sent',
    collapseGroups: false,
    pdfMaxPages: 999,
    pdfDpi: 999,
    maxRows: 5,
    appearanceTheme: 'dark',
  })
  assert.equal(savedSettings.refreshSeconds, 300)
  assert.equal(savedSettings.pdfMaxPages, 40)
  assert.equal(savedSettings.pdfDpi, 160)
  assert.equal(savedSettings.maxRows, 100)
  assert.equal(savedSettings.defaultScope, 'sent')
  assert.equal(savedSettings.appearanceTheme, 'dark')
  assert.equal((await store.readSettings()).autoRefresh, false)

  /* ── archive ── */
  const source = join(root, 'deliverable.docx')
  await writeFile(source, 'hello')
  const archived = await store.archive([source])
  assert.equal(archived.copied.length, 1)
  assert.equal(archived.failed.length, 0)
  assert.ok(archived.archiveDir.startsWith(archive))
  const archiveManifest = await store.readArchive()
  assert.equal(archiveManifest.records.length, 1)
  assert.equal(archiveManifest.records[0].sourcePath, source)
  const clearedArchive = await store.removeArchive([source])
  assert.equal(clearedArchive.records.length, 0)

  /* ── inventory scan ── */
  const imageObject = join(root, 'image-object')
  await writeFile(imageObject, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  const folderPath = join(root, 'folder')
  await mkdir(folderPath, { recursive: true })
  const files = new Map([
    [join(root, 'report.docx'), 1200],
    [join(root, 'final.pdf'), 2400],
    [join(root, 'notes.md'), 80],
    [join(root, 'attachment.zip'), 300],
    [join(root, 'index.js'), 120],
    [imageObject, 4],
    [join(root, 'note.pdf'), 500],
  ])
  const fs = {
    async resolve(pathValue, options = {}) {
      const value = String(pathValue).replace(/\\/g, '/')
      const cwd = options.cwd ? String(options.cwd).replace(/\\/g, '/') : ''
      const absolute = /^[A-Za-z]:\//.test(value) || value.startsWith('/') ? value : `${cwd}/${value}`
      return { targetKey: absolute, displayPath: absolute }
    },
    async stat(target) {
      if (target.displayPath.replace(/\//g, '\\') === folderPath) return { type: 'directory' }
      const size = files.get(target.displayPath.replace(/\//g, '\\'))
      return size === undefined ? undefined : { type: 'file', size, version: 'v1' }
    },
    processPath(target) { return target.displayPath.replace(/\//g, '\\') },
    async listDir(target) {
      const directory = target.displayPath.replace(/\//g, '\\')
      if (directory !== root) return []
      return [...files.keys()]
        .filter(path => dirname(path) === root)
        .map(path => ({ name: baseName(path), type: 'file', target: { targetKey: path, displayPath: path }, size: files.get(path) }))
    },
  }
  const attachmentPath = join(root, 'attachment.zip')
  const events = [
    { type: 'tool/call', data: { turn: 1, step: 1, callId: 'c1', name: 'write', arguments: JSON.stringify({ file_path: 'report.docx', content: '' }) } },
    { type: 'tool/result', data: { turn: 1, step: 1, message: { role: 'tool', toolCallId: 'c1', isError: false, content: [] }, meta: { path: join(root, 'report.docx') } } },
    { type: 'deliverables/presented', data: { turn: 1, callId: 'c2', files: [{ path: join(root, 'final.pdf'), description: 'Final deck' }] } },
    { type: 'user/message', data: { content: [{ type: 'file', attachment: { attachmentId: 'sha256:x', name: 'attachment.zip', bytes: 300 } }, { type: 'text', text: `@${join(root, 'note.pdf')} @${folderPath} 测试 @${join(root, 'deleted.pdf')}` }] } },
    {
      type: 'user/message',
      data: {
        content: [{
          type: 'image',
          attachment: {
            attachmentId: `sha256:${'a'.repeat(64)}`,
            mediaType: 'image/png',
            bytes: 4,
            width: 10,
            height: 10,
            name: 'photo.png',
          },
        }],
      },
    },
    { type: 'tool/call', data: { turn: 2, step: 1, callId: 'c3', name: 'write', arguments: JSON.stringify({ file_path: 'missing.txt' }) } },
    { type: 'tool/result', data: { turn: 2, step: 1, message: { role: 'tool', toolCallId: 'c3', isError: false, content: [] }, meta: { path: join(root, 'missing.txt') } } },
  ]
  const sessionQuery = {
    async readSession() {
      return { session: { id: 's1', cwd: root }, events }
    },
    async listSessions() {
      return [{ header: { id: 's1', cwd: root, createdAt: 1 }, live: true }]
    },
    async readTitleSnapshots() {
      return [{ status: 'fulfilled', sessionId: 's1', value: { title: { title: 'Test conversation' } } }]
    },
  }
  const ctx = {
    get(name) {
      if (name === 'fs') return fs
      if (name === 'sessionQuery') return sessionQuery
      if (name === 'attachments') return { fileHostPath: () => attachmentPath, imageHostPath: () => imageObject }
      return undefined
    },
  }
  const inventory = new InventoryService(ctx, store)
  const sessionResult = await inventory.inventory({ sessionId: 's1', scope: 'session' })
  assert.equal(sessionResult.ok, true)
  assert.equal(sessionResult.files.length, 7)
  assert.ok(sessionResult.files.some(file => file.source === 'delivered' && file.description === 'Final deck'))
  assert.ok(sessionResult.files.some(file => file.source === 'attachment' && file.name === 'attachment.zip'))
  assert.ok(sessionResult.files.some(file => file.source === 'attachment' && file.name === 'note.pdf'))
  const noteRow = sessionResult.files.find(file => file.name === 'note.pdf')
  assert.equal(noteRow.reference, true)
  assert.equal(noteRow.referenceOrigin.sessionId, 's1')
  assert.ok(noteRow.referenceOrigin.excerpt.includes('note.pdf'))
  const missingRow = sessionResult.files.find(file => file.name === 'deleted.pdf')
  assert.ok(missingRow)
  assert.equal(missingRow.missing, true)
  assert.equal(missingRow.reference, true)
  const folderRow = sessionResult.files.find(file => file.isFolder === true)
  assert.ok(folderRow)
  assert.equal(folderRow.reference, true)
  assert.equal(folderRow.category, 'folder')
  assert.ok(folderRow.path.endsWith('folder'))
  assert.ok(sessionResult.files.some(file => file.source === 'written'))
  assert.ok(!sessionResult.files.some(file => file.path.endsWith('missing.txt')))
  const imageRow = sessionResult.files.find(file => file.name === 'photo.png')
  assert.ok(imageRow)
  assert.equal(imageRow.category, 'image')
  assert.ok(imageRow.previewPath.endsWith('.png'))
  assert.equal(imageRow.size, 4)
  const sentResult = await inventory.inventory({ sessionId: 's1', scope: 'sent' })
  assert.equal(sentResult.files.length, 5)
  assert.ok(sentResult.files.every(file => file.source === 'attachment'))
  assert.ok(sentResult.files.some(file => file.name === 'note.pdf'))
  assert.ok(sentResult.files.some(file => file.name === 'deleted.pdf' && file.missing === true))
  assert.ok(sentResult.files.some(file => file.isFolder === true))
  assert.ok(sentResult.files.some(file => file.name === 'note.pdf' && file.reference === true))
  assert.ok(sentResult.files.every(file => file.sessionTitle === 'Test conversation' && file.projectName === baseName(root)), 'sent files must carry hydrated projectName and sessionTitle')
  const projectResult = await inventory.inventory({ sessionId: 's1', scope: 'project' })
  assert.ok(projectResult.files.length >= 4)
  assert.ok(projectResult.files.some(file => file.name === 'index.js' && file.category === 'code'), 'project scope must include workspace code files')
  assert.equal(categoryOf('a.json'), 'code')
  assert.equal(categoryOf({ name: 'folder', isFolder: true }), 'folder')

  /* ── archive root portability, write queue & tombstones ── */
  const savedEnvArchive = process.env.DSH_FILE_LAUNCHER_ARCHIVE_DIR
  try {
    delete process.env.DSH_FILE_LAUNCHER_ARCHIVE_DIR
    const portableDefault = resolveArchiveRoot()
    assert.ok(!/D:\\projects\\Archived_Docs/i.test(portableDefault), 'default archive root must not hardcode developer path')
    assert.ok(portableDefault.endsWith('Archived_Docs'))
    const customArchive = join(root, 'custom-archive')
    await store.writeSettings({ archiveDir: customArchive })
    assert.equal(await store.effectiveArchiveRoot(), customArchive)
    await store.writeSettings({ archiveDir: '' })
  } finally {
    process.env.DSH_FILE_LAUNCHER_ARCHIVE_DIR = savedEnvArchive
  }

  await store.clearPins()
  await Promise.all(
    Array.from({ length: 10 }, (_, idx) =>
      store.addPins([{ path: join(root, `concurrent-${idx}.md`), name: `concurrent-${idx}.md`, cwd: root, sessionId: 's1' }])),
  )
  assert.equal((await store.readPins()).pins.length, 10, 'serialized write queue must preserve all concurrent pin writes')

  const zombiePath = join(root, 'zombie.pdf')
  await store.recordDeleted([zombiePath])
  assert.equal(await store.isDeleted(zombiePath), true)
  await store.clearDeleted([zombiePath])
  assert.equal(await store.isDeleted(zombiePath), false)

  /* ── relative/delivered merge, sent missing preservation & fresh rescan ── */
  files.set(join(root, 'notes.md'), 80)
  const dedupEvents = [
    { type: 'tool/call', data: { turn: 1, step: 1, callId: 'w1', name: 'write', arguments: JSON.stringify({ file_path: 'notes.md', content: 'x' }) } },
    { type: 'tool/result', data: { turn: 1, step: 1, message: { role: 'tool', toolCallId: 'w1', isError: false, content: [] }, meta: {} } },
    { type: 'deliverables/presented', data: { turn: 1, callId: 'p1', files: [{ path: join(root, 'notes.md'), description: 'Summary notes' }] } },
    { type: 'user/message', data: { content: [{ type: 'text', text: `@${join(root, 'never-back.txt')}` }] } },
  ]
  const dedupInventory = new InventoryService({
    get(name) {
      if (name === 'fs') return fs
      if (name === 'sessionQuery') {
        return {
          async readSession() { return { session: { id: 's-dedup', cwd: root }, events: dedupEvents } },
          async listSessions() { return [{ header: { id: 's-dedup', cwd: root, createdAt: 2 }, live: true }] },
          async readTitleSnapshots() { return [{ status: 'fulfilled', sessionId: 's-dedup', value: { title: { title: 'Dedup test' } } }] },
        }
      }
      return undefined
    },
  }, store)
  const mergedSession = await dedupInventory.inventory({ sessionId: 's-dedup', scope: 'session' })
  const noteRows = mergedSession.files.filter(row => row.name === 'notes.md')
  assert.equal(noteRows.length, 1, 'relative write + presented path must merge into one row')
  assert.equal(noteRows[0].source, 'delivered')
  assert.equal(noteRows[0].description, 'Summary notes')

  const cachedSent = await dedupInventory.inventory({ sessionId: 's-dedup', scope: 'sent' })
  const cachedSentMissing = cachedSent.files.find(row => row.name === 'never-back.txt')
  assert.ok(cachedSentMissing && cachedSentMissing.missing === true, 'sent index must preserve true missing flag')

  /* ── shared scanSession single-waiter abort isolation ── */
  let observeCalls = 0
  let observeAborted = false
  const slowInventory = new InventoryService({
    get(name) {
      if (name === 'fs') return fs
      if (name === 'sessionQuery') {
        return {
          async observeSession(_id, options) {
            observeCalls += 1
            return await new Promise((resolve, reject) => {
              options.signal?.addEventListener('abort', () => {
                observeAborted = true
                reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
              })
              setTimeout(() => resolve({ header: { cwd: root }, events: [], [Symbol.dispose]() {} }), 25)
            })
          },
        }
      }
      return undefined
    },
  }, store)
  const ac1 = new AbortController()
  const ac2 = new AbortController()
  const p1 = slowInventory.scanSession('shared-abort', ac1.signal)
  const p2 = slowInventory.scanSession('shared-abort', ac2.signal)
  ac1.abort()
  await assert.rejects(p1, { name: 'AbortError' })
  const res2 = await p2
  assert.equal(observeCalls, 1)
  assert.equal(observeAborted, false, 'aborting one waiter must not cancel another waiter sharing the scan')
  assert.ok(res2)

  /* ── tool relative unpin count accuracy & plugin lifecycle ── */
  await store.clearPins()
  files.set(join(root, 'rel-pin.md'), 42)
  let registeredTool
  const toolDisposer = registerTool({
    get(k) {
      if (k === 'fs') return fs
      if (k === 'workingDirectory') return { ensure: async () => root }
      return undefined
    },
    tools: {
      register(def) { registeredTool = def; return () => { registeredTool = null } },
    },
  }, { inventory: dedupInventory, store })
  assert.ok(registeredTool)
  await registeredTool.execute({ action: 'pin', paths: [join(root, 'rel-pin.md')] }, { agent: { session: { header: { cwd: root } } } })
  const unpinHit = await registeredTool.execute({ action: 'unpin', paths: ['rel-pin.md'] }, { agent: { session: { header: { cwd: root } } } })
  assert.match(unpinHit.text, /^Removed 1 path /i)
  assert.equal((await store.readPins()).pins.length, 0)
  const unpinMiss = await registeredTool.execute({ action: 'unpin', paths: ['rel-pin.md'] }, { agent: { session: { header: { cwd: root } } } })
  assert.match(unpinMiss.text, /No matching pinned path/i)
  toolDisposer()
  assert.equal(registeredTool, null)

  /* ── DSH host entry effect cleanup ── */
  const { apply: applyHost } = await import('../index.js')
  const registeredRoutes = []
  const registeredTools = []
  const cleanupCallbacks = []
  const hostCtx = {
    get(name) {
      if (name === 'fs') return fs
      if (name === 'sessionQuery') return sessionQuery
      if (name === 'connection') {
        return {
          fetch: {
            register(route) {
              registeredRoutes.push(route)
              return () => { const idx = registeredRoutes.indexOf(route); if (idx >= 0) registeredRoutes.splice(idx, 1) }
            },
          },
        }
      }
      return undefined
    },
    tools: {
      register(def) {
        registeredTools.push(def)
        return () => { const idx = registeredTools.indexOf(def); if (idx >= 0) registeredTools.splice(idx, 1) }
      },
    },
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') cleanupCallbacks.push(dispose)
    },
  }
  applyHost(hostCtx)
  assert.equal(registeredTools.length, 1)
  assert.ok(registeredRoutes.length >= 12)
  const appsRoute = registeredRoutes.find(route => route.path === '/api/file-launcher.apps')
  const openAppRoute = registeredRoutes.find(route => route.path === '/api/file-launcher.open-app')
  assert.ok(appsRoute && openAppRoute, 'apps discovery and open-app routes must be registered')
  const appsRes = await appsRoute.fetch(new Request(`http://localhost/api/file-launcher.apps?path=${encodeURIComponent(join(root, 'report.docx'))}`))
  const appsPayload = await appsRes.json()
  assert.equal(appsRes.status, 200)
  assert.equal(appsPayload.ok, true)
  assert.ok(Array.isArray(appsPayload.apps))
  assert.ok(!appsPayload.apps.some(app => /7-?zip|winrar/i.test(app.name || app.id)), 'extension matcher must exclude unrelated apps')
  const hookAppsRes = await appsRoute.fetch(new Request(`http://localhost/api/file-launcher.apps?path=${encodeURIComponent(join(root, '.githooks', 'post-commit'))}`))
  const hookAppsPayload = await hookAppsRes.json()
  assert.equal(hookAppsRes.status, 200)
  assert.equal(hookAppsPayload.ok, true)
  if (process.platform === 'win32') {
    assert.ok(hookAppsPayload.apps.length >= 1, 'extensionless/dotfile files must still match at least one desktop editor/notepad')
  }
  const healthRoute = registeredRoutes.find(route => route.path === '/api/file-launcher.health')
  const healthPayload = await (await healthRoute.fetch(new Request('http://localhost/api/file-launcher.health'))).json()
  assert.equal(healthPayload.capabilities?.apps, true)
  const badOpenRes = await openAppRoute.fetch(new Request('http://localhost/api/file-launcher.open-app', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: join(root, 'report.docx'), appId: 'untrusted-app-id' }),
  }))
  assert.equal(badOpenRes.status, 404, 'open-app must reject unknown app IDs outside detected allowlist')
  for (const dispose of cleanupCallbacks) dispose()
  assert.equal(registeredTools.length, 0, 'host dispose must unregister tool cleanly')
  assert.equal(registeredRoutes.length, 0, 'host dispose must unregister all routes cleanly')

  /* ── DSH community package compliance ── */
  const pkgRoot = fileURLToPath(new URL('..', import.meta.url))
  const pkg = JSON.parse(await readFile(join(pkgRoot, 'package.json'), 'utf8'))
  assert.equal(pkg.license, 'MIT')
  assert.ok(existsSync(join(pkgRoot, 'LICENSE')), 'LICENSE file must exist at package root')
  assert.ok(Array.isArray(pkg.files) && pkg.files.includes('LICENSE'))
  assert.equal(pkg.exports?.['./package.json'], './package.json')
  assert.equal(pkg.exports?.['./cordis.patch.yml'], './cordis.patch.yml')
  assert.ok(typeof pkg.engines?.dsh === 'string' && pkg.engines.dsh.length > 0)
  assert.notEqual(pkg.dsh?.client?.immediately, true, 'community plugin must not block stage-1 startup')
  const clientPkgInject = Array.isArray(pkg.dsh?.client?.inject) ? pkg.dsh.client.inject : []
  assert.ok(!clientPkgInject.includes('@deepseek-ai/dsh-client-ui-file-drag'))
  assert.ok(clientPkgInject.includes('@deepseek-ai/dsh-client-ui-sidebar-documentpreview'))

  /* ── real-disk local fast-path, mtime-first sort & live new-file detection ── */
  const realWs = join(root, 'real-ws')
  const buildDir = join(realWs, '_build')
  const laterDir = join(realWs, 'z_deliverables')
  await mkdir(buildDir, { recursive: true })
  await mkdir(laterDir, { recursive: true })
  const oldDate = new Date(Date.now() - 3600_000)
  await Promise.all(Array.from({ length: 820 }, async (_, idx) => {
    const p = join(buildDir, `gen-${idx}.py`)
    await writeFile(p, 'pass')
    await utimes(p, oldDate, oldDate)
  }))
  const newestDeliverable = join(laterDir, 'final-summary.docx')
  await writeFile(newestDeliverable, 'docx-bytes')
  const realFsAdapter = {
    async resolve(target) { return target },
    processPath(target) { return target },
    async stat(target) {
      const s = await stat(target)
      return { type: s.isDirectory() ? 'directory' : 'file', size: s.size }
    },
    async listDir(target) {
      const ents = await readdir(target, { withFileTypes: true })
      return ents.map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file',
        target: join(target, e.name),
      }))
    },
  }
  const realInv = new InventoryService({
    get(name) {
      if (name === 'fs') return realFsAdapter
      if (name === 'sessionQuery') {
        return {
          async listSessions() { return [{ header: { id: 'real-s1', cwd: realWs } }] },
          async observeSession() { return { header: { cwd: realWs }, events: [], [Symbol.dispose]() {} } },
        }
      }
      return undefined
    },
  }, store)
  try {
    const firstScan = await realInv.inventory({ sessionId: 'real-s1', scope: 'project' })
    assert.equal(firstScan.truncated, true)
    assert.ok(
      firstScan.files.some(row => row.name === 'final-summary.docx'),
      'newest deliverable past 750 older _build files must not be dropped by cap truncation',
    )
    assert.equal(firstScan.files[0].name, 'final-summary.docx')

    const freshFile = join(laterDir, 'just-created.md')
    await writeFile(freshFile, '# brand new')
    await new Promise(resolve => setTimeout(resolve, 180))
    const nextScan = await realInv.inventory({ sessionId: 'real-s1', scope: 'project' })
    assert.equal(nextScan.files[0].name, 'just-created.md', 'fs.watch invalidation + mtime sort must surface newly written file immediately')
  } finally {
    realInv.dispose()
  }

  console.log('file-launcher self-test: ok')
} finally {
  await rm(root, { recursive: true, force: true })
}


