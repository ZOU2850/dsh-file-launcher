/**
 * Browser-half checks. Evaluate the module the way the client loader does,
 * then assert the registration surface, dictionaries, and pure helpers.
 *   node tests/client-test.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { CATEGORY_BY_EXTENSION } from '../lib/util.js'

const file = fileURLToPath(new URL('../client.js', import.meta.url))
const source = readFileSync(file, 'utf8')
let registration
const sandbox = {
  window: {
    __ModuleLoader__: { load(config) { registration = config } },
    dispatchEvent() {},
    matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {} } },
  },
  navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  document: {
    createElement() { return { setAttribute() {}, remove() {}, textContent: '' } },
    head: { appendChild() {} },
    documentElement: {
      style: {},
      classList: { contains() { return false } },
      attributes: {},
      getAttribute(name) { return this.attributes?.[name] ?? null },
      setAttribute(name, value) { this.attributes = { ...(this.attributes || {}), [name]: value } },
    },
    body: { hasAttribute() { return false }, classList: { contains() { return false } }, attributes: {} },
  },
  localStorage: {
    values: new Map(),
    getItem(key) { return this.values.get(key) ?? null },
    setItem(key, value) { this.values.set(key, value) },
  },
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail } },
  MutationObserver: class { observe() {} disconnect() {} },
  console,
  setTimeout,
  clearTimeout,
  URLSearchParams,
  encodeURIComponent,
}
vm.runInNewContext(source, sandbox, { filename: 'client.js' })
assert.ok(registration, 'the module registers through window.__ModuleLoader__')
assert.equal(registration.id, 'dsh-file-launcher')

const React = {
  createElement() { return null },
  useState() { return [undefined, () => {}] },
  useEffect() {},
  useMemo(fn) { return fn() },
  useRef(value) { return { current: value } },
  useCallback(fn) { return fn },
}
const ReactDOM = { createPortal(node) { return node } }
const module = registration.factory(name => {
  if (name === 'react') return React
  if (name === 'react-dom') return ReactDOM
  throw new Error(`unexpected module: ${name}`)
})
assert.equal(typeof module.apply, 'function')
assert.ok(Array.isArray(module.inject))
for (const service of ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'remote', 'remote.session', 'remote.workspaceFiles']) {
  assert.ok(module.inject.includes(service), `inject must include ${service}`)
}
for (const optionalService of ['remote.officeKit', 'fileDrag']) {
  assert.ok(!module.inject.includes(optionalService), `optional service ${optionalService} must not block top-level inject`)
}

const registrations = []
const disposers = []
const injections = []
const fakeContext = {
  effect(callback) {
    const cleanup = callback()
    assert.equal(typeof cleanup, 'function', 'effect callback should always yield a plain disposer function')
    disposers.push(cleanup)
  },
  locale: { bind() { return key => key }, register() {} },
  sidebarRightTabs: { register() {} },
  inject(dependencies, callback) {
    injections.push(dependencies)
    callback({ remote: { officeKit: { render() {} } } })
  },
  slots: {
    inject(name, callback) { callback(); return () => {} },
    register(options, component) {
      if (options.name === 'settings.section') {
        registrations.push({ options, component })
        return { dispose() {} }
      }
      registrations.push({ options, component })
      return undefined
    },
  },
}
module.apply(fakeContext)
assert.ok(injections.some(dependencies => dependencies.includes('remote.officeKit')), 'officeKit must be optionally injected')
for (const cleanup of disposers) cleanup()

const throwContext = {
  effect(callback) {
    const cleanup = callback()
    assert.equal(typeof cleanup, 'function')
    cleanup()
  },
  locale: { bind() { return key => key }, register() {} },
  sidebarRightTabs: { register() {} },
  slots: {
    inject(name, callback) {
      callback()
      return () => {}
    },
    register(options) {
      if (options.name === 'settings.section') throw new Error('missing slot contract')
      return { dispose() {} }
    },
  },
}
assert.doesNotThrow(() => module.apply(throwContext), 'optional slot failure must not break core registration')

const settings = registrations.find(entry => entry.options.name === 'settings.section')
assert.ok(settings, 'settings.section must be registered')
assert.equal(settings.options.id, 'file-launcher.settings')
assert.equal(typeof settings.component, 'function')
assert.equal(typeof settings.options.label(), 'string')
const internals = module.__internals
assert.ok(internals)
internals.writeLocalAppearance({ appearanceTheme: 'dark' })
assert.equal(JSON.parse(sandbox.localStorage.getItem('dsh-file-launcher.appearance.v1')).appearanceTheme, 'dark')
assert.equal(sandbox.document.documentElement.getAttribute('data-dfl-theme'), 'dark')
assert.equal(internals.themeAttributes({ appearanceTheme: 'dark' }, 'dark')['data-dfl-scheme'], 'dark')
assert.ok(internals.CSS.includes('.dfl-root'))
assert.ok(internals.CSS.includes('.dfl-theme[data-dfl-scheme="light"]'))
assert.ok(internals.CSS.includes('.dfl-theme[data-dfl-scheme="dark"]'))
assert.ok(internals.CSS.includes('.dfl-theme-picker'))
for (const cat of ['design', 'executable', 'database', 'font', 'disk', 'binary', 'folder']) {
  assert.ok(internals.CSS.includes(`.dfl-icon[data-cat="${cat}"]`), `CSS must style category ${cat}`)
}
assert.equal(internals.categoryOf('report.docx'), 'document')
assert.equal(internals.categoryOf('deck.pptx'), 'slides')
assert.equal(internals.categoryOf('data.xlsx'), 'sheets')
assert.equal(internals.categoryOf('README.md'), 'markdown')
assert.equal(internals.categoryOf('poster.psd'), 'design')
assert.equal(internals.categoryOf('setup.exe'), 'executable')
assert.equal(internals.categoryOf('app.sqlite'), 'database')
assert.equal(internals.categoryOf('mono.woff2'), 'font')
assert.equal(internals.categoryOf('disk.iso'), 'disk')
assert.equal(internals.categoryOf('module.wasm'), 'binary')
for (const [extWithDot, category] of CATEGORY_BY_EXTENSION.entries()) {
  const ext = extWithDot.replace(/^\./, '')
  assert.equal(internals.EXTENSION_CATEGORY[ext], category, `client category mismatch for ${extWithDot}`)
}
assert.equal(Object.keys(internals.EXTENSION_CATEGORY).length, CATEGORY_BY_EXTENSION.size)

assert.equal(internals.isImageFile({ name: 'pic.png', path: 'C:\\a\\pic.png' }), true)
assert.equal(internals.isImageFile({ name: 'pic.avif', path: 'C:\\a\\pic.avif' }), true)
assert.equal(internals.isImageFile({ name: 'scan.tiff', path: 'C:\\a\\scan.tiff' }), false, 'TIFF cannot decode in <img>')
assert.equal(internals.isImageFile({ name: 'scan.tif', path: 'C:\\a\\scan.tif' }), false)
assert.equal(internals.canPanelPreview({ name: 'scan.tiff', path: 'C:\\a\\scan.tiff' }), false)
assert.equal(internals.canPanelPreview({ name: 'folder', path: 'C:\\a\\folder', isFolder: true }), false)
assert.equal(internals.canPanelPreview({ name: 'doc.pdf', path: 'C:\\a\\doc.pdf' }), true)

assert.equal(Object.keys(internals.themeAttributes({ appearanceTheme: 'host' }, 'dark')).length, 0)
assert.equal(internals.themeAttributes({ appearanceTheme: 'dark' }, 'dark')['data-dfl-scheme'], 'dark')
assert.equal(internals.themeAttributes({ appearanceTheme: 'light' }, 'light')['data-dfl-scheme'], 'light')

assert.equal(
  internals.fileRowKey({ path: 'C:\\Work\\Doc.md', cwd: 'C:\\Work', sessionId: 's1' }),
  internals.fileRowKey({ path: 'c:/work/doc.md', cwd: 'c:/work', sessionId: 's1' }),
)
assert.notEqual(
  internals.fileRowKey({ path: 'C:\\Work\\Doc.md', sessionId: 's1' }),
  internals.fileRowKey({ path: 'C:\\Work\\Doc.md', sessionId: 's2' }),
)
assert.notEqual(
  internals.fileRowKey({ path: 'C:\\Work\\Item', isFolder: false, sessionId: 's1' }),
  internals.fileRowKey({ path: 'C:\\Work\\Item', isFolder: true, sessionId: 's1' }),
)

assert.equal(internals.extensionLabel('report.docx'), 'DOCX')
assert.equal(
  internals.fileAddressFor('session-1', 'C:\\work', 'C:\\work\\sub\\a b.md'),
  'dsh-resource://file/session/session-1/sub/a%20b.md',
)
assert.equal(
  internals.fileAddressFor('session-1', 'C:\\work', 'C:\\other\\a.md'),
  'dsh-resource://file/session/session-1/C:/other/a.md',
)
assert.equal(internals.referenceText('C:\\work\\sub\\a.md', 'C:\\work'), '@sub/a.md')
assert.equal(internals.referenceText('C:\\work\\a b.md', 'C:\\work'), '@"a b.md"')

const zhKeys = Object.keys(internals.zh).sort()
const enKeys = Object.keys(internals.en).sort()
assert.deepEqual(zhKeys, enKeys, 'zh and en dictionaries must carry the same keys')
assert.ok(zhKeys.includes('settings.archiveDirCustom'))
assert.ok(zhKeys.includes('viewer.textTruncated'))
assert.ok(internals.zh['viewer.truncated'].includes('{count}'))
assert.ok(internals.en['viewer.truncated'].includes('{count}'))
assert.ok(zhKeys.length > 40)

console.log(`file-launcher client-test: ok (${zhKeys.length} locale keys)`)
