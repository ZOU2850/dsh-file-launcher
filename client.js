/**
 * File Launcher for DeepSeek Harness — browser half.
 *
 * A right-Sidebar tab that lists what the current conversation produced,
 * delivered, read, or received, plus the readable documents in its workspace.
 * Rows preview in the Sidebar, open in native applications, reveal in the file
 * manager, add `@` references to the composer, pin against context compaction,
 * and archive copies to the user's archive folder.
 */

window.__ModuleLoader__.load({
  id: 'dsh-file-launcher',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef, useCallback } = React

    /** Client locale namespace. */
    const NS = 'fileLauncher'
    /** Tab kind (page type, no resource address). */
    const KIND = 'file-launcher'
    /** This implementation's identity in the tab system. */
    const ID = 'dsh-file-launcher'

    /* ─────────────────────────── small helpers ─────────────────────────── */

    const CATEGORY_ORDER = [
      'document', 'slides', 'sheets', 'pdf', 'markdown', 'image', 'text', 'web',
      'code', 'media', 'archive', 'design', 'database', 'font', 'executable',
      'disk', 'binary', 'folder', 'other',
    ]

    const CATEGORY_LABELS = {
      all: 'filter.all',
      document: 'filter.document',
      slides: 'filter.slides',
      sheets: 'filter.sheets',
      pdf: 'filter.pdf',
      markdown: 'filter.markdown',
      text: 'filter.text',
      image: 'filter.image',
      web: 'filter.web',
      code: 'filter.code',
      media: 'filter.media',
      archive: 'filter.archive',
      design: 'filter.design',
      executable: 'filter.executable',
      database: 'filter.database',
      font: 'filter.font',
      disk: 'filter.disk',
      binary: 'filter.binary',
      folder: 'filter.folder',
      other: 'filter.other',
    }

    const SOURCE_ORDER = ['all', 'delivered', 'written', 'edited', 'attachment', 'reference', 'read', 'workspace', 'pinned']

    const SOURCE_LABELS = {
      delivered: 'source.delivered',
      written: 'source.written',
      edited: 'source.edited',
      attachment: 'source.attachment',
      reference: 'source.reference',
      read: 'source.read',
      workspace: 'source.workspace',
      pinned: 'source.pinned',
    }

    const EXTENSION_CATEGORY = {
      doc: 'document', docx: 'document', odt: 'document', rtf: 'document', pages: 'document', wps: 'document',
      ppt: 'slides', pptx: 'slides', odp: 'slides', key: 'slides', dps: 'slides',
      xls: 'sheets', xlsx: 'sheets', xlsm: 'sheets', csv: 'sheets', tsv: 'sheets', ods: 'sheets', numbers: 'sheets', et: 'sheets',
      pdf: 'pdf',
      md: 'markdown', markdown: 'markdown', mdx: 'markdown',
      txt: 'text', log: 'text', yaml: 'text', yml: 'text', toml: 'text',
      ini: 'text', cfg: 'text', conf: 'text', xml: 'text', env: 'text', properties: 'text',
      png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image',
      ico: 'image', tif: 'image', tiff: 'image', avif: 'image',
      html: 'web', htm: 'web', css: 'web', scss: 'web', sass: 'web', less: 'web', vue: 'web', svelte: 'web', astro: 'web',
      js: 'code', mjs: 'code', cjs: 'code', ts: 'code', tsx: 'code', jsx: 'code', json: 'code', jsonc: 'code', jsonl: 'code',
      py: 'code', ps1: 'code', psm1: 'code', sh: 'code', bash: 'code', zsh: 'code', bat: 'code', cmd: 'code',
      java: 'code', kt: 'code', kts: 'code', go: 'code', rs: 'code', c: 'code', h: 'code', cc: 'code', cpp: 'code', cxx: 'code', hpp: 'code',
      cs: 'code', rb: 'code', php: 'code', swift: 'code', lua: 'code', r: 'code', scala: 'code', sql: 'code',
      dart: 'code', ex: 'code', exs: 'code', erl: 'code', hs: 'code', clj: 'code', gradle: 'code',
      make: 'code', dockerfile: 'code', graphql: 'code', gql: 'code', proto: 'code',
      mp4: 'media', mov: 'media', mkv: 'media', avi: 'media', webm: 'media', mp3: 'media', wav: 'media',
      flac: 'media', m4a: 'media', ogg: 'media', aac: 'media',
      zip: 'archive', '7z': 'archive', rar: 'archive', tar: 'archive', gz: 'archive', tgz: 'archive',
      bz2: 'archive', xz: 'archive', zst: 'archive',
      psd: 'design', ai: 'design', eps: 'design', sketch: 'design', fig: 'design', xd: 'design', dwg: 'design', dxf: 'design',
      blend: 'design', obj: 'design', stl: 'design', '3ds': 'design', indd: 'design', afdesign: 'design',
      exe: 'executable', msi: 'executable', msix: 'executable', appx: 'executable', app: 'executable',
      dmg: 'executable', pkg: 'executable', deb: 'executable', rpm: 'executable', apk: 'executable', appimage: 'executable',
      db: 'database', sqlite: 'database', sqlite3: 'database', mdb: 'database', accdb: 'database', dbf: 'database', parquet: 'database',
      ttf: 'font', otf: 'font', woff: 'font', woff2: 'font', eot: 'font',
      iso: 'disk', img: 'disk', vhd: 'disk', vhdx: 'disk', vmdk: 'disk',
      bin: 'binary', dat: 'binary', pak: 'binary', wasm: 'binary', dll: 'binary', so: 'binary', dylib: 'binary',
      o: 'binary', a: 'binary', lib: 'binary', class: 'binary', pyc: 'binary',
    }

    /** Lowercase extension without the dot. */
    function extensionOf(name) {
      const text = String(name || '')
      const base = text.slice(Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\')) + 1)
      const dot = base.lastIndexOf('.')
      return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1).toLowerCase() : ''
    }

    /** UI category of a file name, path, or file row object. */
    function categoryOf(nameOrItem, isFolder = false) {
      if (isFolder === true) return 'folder'
      if (nameOrItem && typeof nameOrItem === 'object') {
        if (nameOrItem.isFolder === true) return 'folder'
        return EXTENSION_CATEGORY[extensionOf(nameOrItem.name || nameOrItem.path || '')] || 'other'
      }
      return EXTENSION_CATEGORY[extensionOf(nameOrItem)] || 'other'
    }

    const DELIVERABLE_DOC_EXTENSIONS = new Set([
      'docx', 'doc', 'odt', 'rtf', 'pages', 'wps',
      'ppt', 'pptx', 'odp', 'key', 'dps',
      'xls', 'xlsx', 'xlsm', 'csv', 'tsv', 'ods', 'numbers', 'et',
      'pdf', 'md', 'mdx', 'markdown', 'txt', 'html', 'htm',
    ])

    function isReadableFile(file) {
      if (!file) return false
      if (file.isFolder === true || file.source === 'attachment' || file.source === 'delivered' || file.source === 'pinned') return true
      const ext = extensionOf(file.name || file.path)
      if (DELIVERABLE_DOC_EXTENSIONS.has(ext) || BROWSER_IMAGE_EXTENSIONS.has(ext) || ext === 'tif' || ext === 'tiff') return true
      const cat = file.category || categoryOf(file)
      return cat === 'media' || cat === 'archive' || cat === 'design'
    }

    function matchesSourceFilter(file, filter) {
      if (!filter || filter === 'all') return true
      if (filter === 'reference') return file?.reference === true
      return file?.source === filter
    }

    /** Office formats the Host office-kit can convert to a PDF preview. */
    const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'xlsm'])

    /** Image extensions Chromium <img> elements can decode directly (excludes TIFF). */
    const BROWSER_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'])

    /** Text-like formats the panel can read directly. */
    const TEXT_EXTENSIONS = new Set([
      'md', 'markdown', 'mdx', 'txt', 'log', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'cfg',
      'conf', 'xml', 'csv', 'tsv', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'ps1', 'psm1',
      'sh', 'bash', 'zsh', 'bat', 'cmd', 'css', 'scss', 'less', 'html', 'htm', 'sql', 'java',
      'go', 'rs', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'rb', 'php', 'swift', 'lua', 'r', 'scala',
      'dart', 'ex', 'exs', 'erl', 'hs', 'clj', 'gradle', 'make', 'dockerfile',
    ])

    /** Whether an image name can be decoded by an `<img>` element. */
    function imageMime(name) {
      switch (extensionOf(name)) {
        case 'png': return 'image/png'
        case 'jpg': case 'jpeg': return 'image/jpeg'
        case 'gif': return 'image/gif'
        case 'webp': return 'image/webp'
        case 'bmp': return 'image/bmp'
        case 'svg': return 'image/svg+xml'
        case 'ico': return 'image/x-icon'
        case 'avif': return 'image/avif'
        default: return 'application/octet-stream'
      }
    }

    /** Convert binary bytes to base64 without spreading huge arrays. */
    function bytesToBase64(input) {
      const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
      let binary = ''
      const chunk = 0x8000
      for (let offset = 0; offset < bytes.length; offset += chunk) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
      }
      return btoa(binary)
    }

    /** Whether the panel can preview this file itself. */
    function canPanelPreview(file) {
      if (!file || file.isFolder) return false
      const extension = extensionOf(file.name || file.path)
      return isImageFile(file) || extension === 'pdf' || OFFICE_EXTENSIONS.has(extension) || TEXT_EXTENSIONS.has(extension)
    }

    /** Whether this file is an Office document converted through office-kit. */
    function isOfficeFile(file) {
      return OFFICE_EXTENSIONS.has(extensionOf(file.name || file.path))
    }

    /** Whether this file is a PDF. */
    function isPdfFile(file) {
      return extensionOf(file.name || file.path) === 'pdf'
    }

    /** Whether this file is a browser-renderable image. */
    function isImageFile(file) {
      return !file?.isFolder && BROWSER_IMAGE_EXTENSIONS.has(extensionOf(file?.previewPath || file?.name || file?.path))
    }

    /** Stable UI row key accounting for case-insensitive paths, folder kind, and session grouping. */
    function fileRowKey(file) {
      if (!file) return ''
      return `${file.sessionId || ''}|${pathKey(file.cwd || '')}|${file.isFolder ? 'd' : 'f'}|${pathKey(file.path)}`
    }

    /** Uppercase icon label. */
    function extensionLabel(name) {
      const extension = extensionOf(name)
      if (extension.length === 0) return 'FILE'
      return extension.slice(0, 4).toUpperCase()
    }

    /** Normalize slashes for display. */
    function slashPath(value) {
      return String(value || '').replace(/\\/g, '/')
    }

    /** Normalize a path into a comparison key. */
    function pathKey(value) {
      return slashPath(value).replace(/\/+$/, '').toLowerCase()
    }

    /** Final path segment using either separator. */
    function baseName(value) {
      const normalized = String(value || '').replace(/[/\\]+$/, '')
      return normalized.slice(Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\')) + 1)
    }

    /** Relative display path inside a workspace root. */
    function relativeOf(absolutePath, cwd) {
      const file = slashPath(absolutePath)
      const root = typeof cwd === 'string' ? slashPath(cwd).replace(/\/+$/, '') : ''
      if (root.length === 0) return file
      if (file.toLowerCase() === root.toLowerCase()) return ''
      if (file.toLowerCase().startsWith(`${root.toLowerCase()}/`)) return file.slice(root.length + 1)
      return file
    }

    /** Component-encode one file-address segment, keeping `:` literal for drive letters. */
    function encodeSegment(segment) {
      return encodeURIComponent(segment).replace(/%3A/gi, ':')
    }

    /** Build a `dsh-resource://file/session/...` address. */
    function fileAddressFor(sessionId, cwd, path) {
      const normalized = slashPath(path)
      const root = typeof cwd === 'string' ? slashPath(cwd).replace(/\/+$/, '') : ''
      let relative = normalized
      if (root.length > 0) {
        if (normalized.toLowerCase() === root.toLowerCase()) relative = ''
        else if (normalized.toLowerCase().startsWith(`${root.toLowerCase()}/`)) relative = normalized.slice(root.length + 1)
      }
      return `dsh-resource://file/session/${encodeSegment(sessionId)}/${relative.split('/').map(encodeSegment).join('/')}`
    }

    /** Last-resort plain-text insertion when the composer's InputActions are unavailable. */
    function insertComposerTextFallback(text) {
      if (typeof document === 'undefined' || typeof window === 'undefined') return false
      const editor = document.querySelector('[data-composer-card] [contenteditable="true"]')
        || document.querySelector('[contenteditable="true"]')
      if (editor === null) return false
      try {
        editor.focus()
        const selection = window.getSelection()
        if (selection === null) return false
        const range = document.createRange()
        range.selectNodeContents(editor)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
        return document.execCommand('insertText', false, text)
      } catch {
        return false
      }
    }


    function referenceText(absolutePath, cwd) {
      const absolute = slashPath(absolutePath)
      const root = typeof cwd === 'string' ? slashPath(cwd).replace(/\/+$/, '') : ''
      let target = absolute
      if (root.length > 0 && (absolute.toLowerCase() === root.toLowerCase()
        || absolute.toLowerCase().startsWith(`${root.toLowerCase()}/`))) {
        target = absolute.slice(root.length).replace(/^\/+/, '')
      }
      if (target.length === 0) target = absolute
      return /[\s"`]/.test(target) ? `@"${target.replace(/"/g, '\\"')}"` : `@${target}`
    }

    /** Compact byte size. */
    function formatBytes(bytes) {
      if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return ''
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
      return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
    }

    /** Detect the surrounding DSH theme from the document. */
    function hostPrefersDark() {
      if (typeof document === 'undefined') return false
      const body = document.body
      const root = document.documentElement
      return Boolean(
        (body && (body.hasAttribute('data-ds-dark-theme') || body.classList.contains('dark')))
        || (root && root.classList.contains('dark')),
      )
    }

    /** Resolve a configured mode without React (for document-level theming). */
    function resolveScheme(mode) {
      if (mode === 'dark' || mode === 'light') return mode
      if (mode === 'system') {
        return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      }
      return hostPrefersDark() ? 'dark' : 'light'
    }

    /** Mirror the resolved theme onto <html> so a stale panel still follows it. */
    function applyDocumentTheme(settings) {
      if (typeof document === 'undefined') return
      const scheme = resolveScheme(settings?.appearanceTheme || 'host')
      document.documentElement.setAttribute('data-dfl-theme', scheme)
      document.documentElement.style.colorScheme = scheme
    }

    /** Resolve a configured appearance mode to a concrete light/dark scheme. */
    function useResolvedScheme(mode) {
      const [systemDark, setSystemDark] = useState(() => typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-color-scheme: dark)').matches)
      const [hostDark, setHostDark] = useState(hostPrefersDark)

      useEffect(() => {
        const media = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          ? window.matchMedia('(prefers-color-scheme: dark)')
          : undefined
        const onMedia = event => setSystemDark(event.matches)
        if (media !== undefined) {
          if (typeof media.addEventListener === 'function') media.addEventListener('change', onMedia)
          else if (typeof media.addListener === 'function') media.addListener(onMedia)
        }
        const observer = typeof MutationObserver === 'function'
          ? new MutationObserver(() => setHostDark(hostPrefersDark()))
          : undefined
        observer?.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-ds-dark-theme'] })
        if (document.body) observer?.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-ds-dark-theme'] })
        return () => {
          if (media !== undefined) {
            if (typeof media.removeEventListener === 'function') media.removeEventListener('change', onMedia)
            else if (typeof media.removeListener === 'function') media.removeListener(onMedia)
          }
          observer?.disconnect()
        }
      }, [])

      if (mode === 'dark' || mode === 'light') return mode
      if (mode === 'system') return systemDark ? 'dark' : 'light'
      return hostDark ? 'dark' : 'light'
    }

    /** Attributes shared by every plugin-owned surface (panel, menus, modals). */
    function themeAttributes(settings, scheme) {
      const mode = settings?.appearanceTheme || 'host'
      if (mode === 'host') return {}
      return {
        'data-dfl-scheme': scheme,
      }
    }

    const APPEARANCE_KEY = 'dsh-file-launcher.appearance.v1'
    const APPEARANCE_FIELDS = ['appearanceTheme']
    const SETTINGS_EVENT = 'dfl-settings'

    /** Appearance is display-local, so it is mirrored in localStorage too. */
    function readLocalAppearance() {
      if (typeof localStorage === 'undefined') return {}
      try {
        const value = JSON.parse(localStorage.getItem(APPEARANCE_KEY) || '{}')
        if (typeof value !== 'object' || value === null) return {}
        const result = {}
        for (const key of APPEARANCE_FIELDS) {
          if (value[key] !== undefined) result[key] = value[key]
        }
        return result
      } catch {
        return {}
      }
    }

    /** Publish appearance changes so an open sidebar updates immediately. */
    function writeLocalAppearance(settings) {
      const value = {}
      for (const key of APPEARANCE_FIELDS) {
        if (settings?.[key] !== undefined) value[key] = settings[key]
      }
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(APPEARANCE_KEY, JSON.stringify(value))
      } catch {}
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dfl-appearance', { detail: value }))
      }
      applyDocumentTheme(value)
      return value
    }


    function formatTime(milliseconds) {
      if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds)) return ''
      const date = new Date(milliseconds)
      if (Number.isNaN(date.getTime())) return ''
      const pad = n => String(n).padStart(2, '0')
      return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    /** Fetch one JSON route, surfacing the server's own error text. */
    async function api(path, options) {
      const init = options || {}
      const headers = { ...(init.body === undefined ? {} : { 'content-type': 'application/json' }), ...(init.headers || {}) }
      const response = await fetch(path, { ...init, headers })
      if (response.status === 204) return { ok: true }
      const text = await response.text()
      let value
      try {
        value = text.length > 0 ? JSON.parse(text) : {}
      } catch {
        value = { ok: response.ok, error: text }
      }
      if (!response.ok || value.ok === false) {
        const error = new Error(value.error || `HTTP ${response.status}`)
        error.status = response.status
        throw error
      }
      return value
    }

    /** Copy text, with a legacy fallback for environments without the clipboard API. */
    async function copyText(text) {
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(text)
          return true
        }
      } catch {
        // Fall through to the selection-based copy.
      }
      try {
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.left = '-9999px'
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand('copy')
        area.remove()
        return ok
      } catch {
        return false
      }
    }

    /** Small launcher glyph used by the tab title and the guide card. */
    function LauncherGlyph({ size = 16 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true,
        style: { display: 'block', flex: 'none' },
      },
      h('path', {
        d: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h2.9c.7 0 1.4.3 1.9.8l1 1.1H17.5A2.5 2.5 0 0 1 20 8.4v9.1a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11Z',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinejoin: 'round',
      }),
      h('path', {
        d: 'M9 13.2h6m-2.5-2.5 2.5 2.5-2.5 2.5',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }))
    }

    /** Crisp 1.8px-stroke linear SVG primitives shared across the redesigned UI. */
    function SvgIcon({ size = 13, viewBox = '0 0 24 24', className, strokeWidth = 1.8, children }) {
      return h('svg', {
        width: size, height: size, viewBox, fill: 'none',
        stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, className,
        style: { display: 'block', flex: 'none' },
      }, ...(Array.isArray(children) ? children : [children]))
    }

    const RefreshIcon = (size = 13) => SvgIcon({
      size,
      children: [
        h('path', { key: 'a', d: 'M21 12a9 9 0 1 1-2.64-6.36' }),
        h('polyline', { key: 'b', points: '21 3 21 9 15 9' }),
      ],
    })
    const SearchIcon = (size = 13) => SvgIcon({
      size,
      className: 'dfl-search-icon',
      children: [
        h('circle', { key: 'a', cx: 11, cy: 11, r: 7 }),
        h('line', { key: 'b', x1: 21, y1: 21, x2: 16.65, y2: 16.65 }),
      ],
    })
    const CaretDownIcon = (size = 11) => SvgIcon({
      size, strokeWidth: 2, className: 'dfl-svg-caret',
      children: h('path', { d: 'm6 9 6 6 6-6' }),
    })
    const ChevronRightIcon = (size = 12, className = 'dfl-group-caret') => SvgIcon({
      size, strokeWidth: 2, className,
      children: h('path', { d: 'm9 6 6 6-6 6' }),
    })
    const ExternalArrowIcon = (size = 13) => SvgIcon({
      size, strokeWidth: 1.9,
      children: [
        h('path', { key: 'a', d: 'M7 17 17 7' }),
        h('path', { key: 'b', d: 'M9 7h8v8' }),
      ],
    })
    const StarIcon = (filled = false, size = 13) => h('svg', {
      width: size, height: size, viewBox: '0 0 24 24',
      fill: filled ? 'currentColor' : 'none',
      stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
      'aria-hidden': true, style: { display: 'block', flex: 'none' },
    }, h('polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' }))
    const CheckIcon = (size = 11) => SvgIcon({
      size, strokeWidth: 2.3,
      children: h('polyline', { points: '20 6 9 17 4 12' }),
    })
    const FilterIcon = (size = 12) => SvgIcon({
      size, strokeWidth: 1.8,
      children: h('polygon', { points: '22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3' }),
    })
    const ArchiveIcon = (size = 12) => SvgIcon({
      size, strokeWidth: 1.8,
      children: [
        h('polyline', { key: 'a', points: '21 8 21 21 3 21 3 8' }),
        h('rect', { key: 'b', x: 1, y: 3, width: 22, height: 5, rx: 1 }),
        h('line', { key: 'c', x1: 10, y1: 12, x2: 14, y2: 12 }),
      ],
    })
    const FolderIcon = (size = 12) => SvgIcon({
      size, strokeWidth: 1.8,
      children: h('path', { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' }),
    })
    const GlobeIcon = (size = 12) => SvgIcon({
      size, strokeWidth: 1.8,
      children: [
        h('circle', { key: 'a', cx: 12, cy: 12, r: 9 }),
        h('line', { key: 'b', x1: 3, y1: 12, x2: 21, y2: 12 }),
        h('path', { key: 'c', d: 'M12 3a14.5 14.5 0 0 1 0 18 14.5 14.5 0 0 1 0-18z' }),
      ],
    })
    const ChatIcon = (size = 12) => SvgIcon({
      size, strokeWidth: 1.8,
      children: h('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }),
    })
    const BackIcon = (size = 13) => SvgIcon({
      size, strokeWidth: 2,
      children: h('path', { d: 'm15 18-6-6 6-6' }),
    })
    const CloseIcon = (size = 12) => SvgIcon({
      size, strokeWidth: 2,
      children: [
        h('line', { key: 'a', x1: 18, y1: 6, x2: 6, y2: 18 }),
        h('line', { key: 'b', x1: 6, y1: 6, x2: 18, y2: 18 }),
      ],
    })
    const PrevIcon = (size = 13) => SvgIcon({ size, strokeWidth: 2, children: h('path', { d: 'm15 18-6-6 6-6' }) })
    const NextIcon = (size = 13) => SvgIcon({ size, strokeWidth: 2, children: h('path', { d: 'm9 18 6-6-6-6' }) })
    const PinBadgeIcon = (size = 10) => h('svg', {
      width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor',
      'aria-hidden': true, style: { display: 'block', flex: 'none' },
    }, h('polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' }))
    const RefLinkIcon = (size = 10) => SvgIcon({
      size, strokeWidth: 2,
      children: [
        h('path', { key: 'a', d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }),
        h('path', { key: 'b', d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }),
      ],
    })
    const WarningIcon = (size = 15) => SvgIcon({
      size, strokeWidth: 1.9,
      children: [
        h('path', { key: 'a', d: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' }),
        h('line', { key: 'b', x1: 12, y1: 9, x2: 12, y2: 13 }),
        h('line', { key: 'c', x1: 12, y1: 17, x2: 12.01, y2: 17 }),
      ],
    })

    /* ─────────────────────────── panel component ─────────────────────────── */

    /**
     * Build the stable panel component for one plugin context.
     * @param ctx - client plugin context carrying the Remote and Sidebar services.
     * @returns the tab body component.
     */
    function createPanel(ctx, officeKitRef) {
      return function FileLauncherPanel(props) {
        const { sessionId, useSessions, useTabInfo, inputActions, t } = props
        const { tab, panel } = useTabInfo()

        /* Session catalog. */
        const sessionRow = useSessions(state => state.byId[sessionId])
        const allById = useSessions(state => state.byId)
        const cwd = sessionRow && sessionRow.cwd ? sessionRow.cwd : undefined
        const sessionTitle = (sessionRow && (sessionRow.displayTitle || sessionRow.title)) || sessionId

        const sessions = useMemo(() => {
          const rows = allById && typeof allById === 'object' ? Object.values(allById) : []
          return rows
            .filter(row => row && row.origin !== 'subagent' && row.blank !== true)
            .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
        }, [allById])

        /* Panel state. */
        const [scope, setScope] = useState('session')
        const [regionTarget, setRegionTarget] = useState({ kind: 'current-session' })
        const [preferences, setPreferences] = useState(null)
        const [traceFile, setTraceFile] = useState(null)
        const scheme = useResolvedScheme(preferences?.appearanceTheme || 'host')
        const scopeTouched = useRef(false)
        const [historySessions, setHistorySessions] = useState([])
        const [data, setData] = useState(null)
        const [sentData, setSentData] = useState(null)
        const [pins, setPins] = useState([])
        const [pinsError, setPinsError] = useState('')
        const [health, setHealth] = useState(null)
        const [desktop, setDesktop] = useState(null)
        const [loading, setLoading] = useState(false)
        const [loadElapsedMs, setLoadElapsedMs] = useState(0)
        const loadingStartedAtRef = useRef(0)
        const viewerStartedAtRef = useRef(0)
        const scopeDurationRef = useRef({ session: 1200, sent: 3500, project: 1800, viewer: 2500 })
        const viewerCacheRef = useRef(new Map())
        const lastSessionUpdatedRef = useRef(Number(sessionRow?.updatedAt || 0))
        const lastFocusSyncRef = useRef(0)
        const forceFreshRef = useRef(false)
        const [error, setError] = useState('')
        const [query, setQuery] = useState('')
        const [category, setCategory] = useState('all')
        const [sort, setSort] = useState('time')
        const [selectMode, setSelectMode] = useState(false)
        const [selected, setSelected] = useState(() => new Set())
        const [contextMenu, setContextMenu] = useState(null)
        const [pendingDelete, setPendingDelete] = useState(null)
        const [filterMenu, setFilterMenu] = useState(null)
        const [filterPos, setFilterPos] = useState({ left: 8, top: 120, width: 340 })
        const [scopeMenuOpen, setScopeMenuOpen] = useState(false)
        const [scopePos, setScopePos] = useState({ left: 10, top: 42, width: 320, maxHeight: 380 })
        const scopeBtnRef = useRef(null)
        const filterBtnRef = useRef(null)
        const contextMenuRef = useRef(null)

        useEffect(() => {
          if (contextMenu === null) return
          const node = contextMenuRef.current
          if (node === null) return
          const first = node.querySelector('.dfl-menu-item')
          if (first !== null) first.focus()
        }, [contextMenu])

        useEffect(() => {
          if (!scopeMenuOpen) return undefined
          const updatePos = () => {
            const btn = scopeBtnRef.current
            const vw = window.innerWidth || 420
            const vh = window.innerHeight || 720
            const width = Math.max(240, Math.min(360, vw - 16))
            if (!btn || typeof btn.getBoundingClientRect !== 'function') {
              setScopePos({ left: 8, top: 42, width, maxHeight: Math.min(380, vh - 80) })
              return
            }
            const rect = btn.getBoundingClientRect()
            const left = Math.max(8, Math.min(rect.left, vw - width - 8))
            const spaceBelow = vh - rect.bottom - 12
            setScopePos({ left, top: Math.max(8, rect.bottom + 4), width: Math.max(rect.width, Math.min(360, vw - 16)), maxHeight: Math.max(180, Math.min(400, spaceBelow)) })
          }
          updatePos()
          const dismiss = (event) => {
            const target = event.target
            if (target instanceof Element && (target.closest('.dfl-scope-dropdown') !== null || target.closest('.dfl-scope-trigger') !== null)) return
            setScopeMenuOpen(false)
          }
          const onKey = (event) => { if (event.key === 'Escape') setScopeMenuOpen(false) }
          window.addEventListener('resize', updatePos)
          document.addEventListener('mousedown', dismiss)
          document.addEventListener('keydown', onKey)
          return () => {
            window.removeEventListener('resize', updatePos)
            document.removeEventListener('mousedown', dismiss)
            document.removeEventListener('keydown', onKey)
          }
        }, [scopeMenuOpen])

        useEffect(() => {
          if (filterMenu === null) return
          const updatePos = () => {
            const btn = filterBtnRef.current
            const vw = window.innerWidth || 420
            const vh = window.innerHeight || 720
            const width = Math.max(240, Math.min(340, vw - 16))
            if (!btn || typeof btn.getBoundingClientRect !== 'function') {
              setFilterPos({ left: 8, top: 120, width, maxHeight: Math.min(360, vh - 140) })
              return
            }
            const rect = btn.getBoundingClientRect()
            const left = Math.max(8, Math.min(rect.left, vw - width - 8))
            const spaceBelow = vh - rect.bottom - 12
            const spaceAbove = rect.top - 12
            const openUp = spaceBelow < 240 && spaceAbove > spaceBelow
            const maxHeight = Math.max(180, Math.min(360, openUp ? spaceAbove : spaceBelow))
            const top = openUp
              ? Math.max(8, rect.top - Math.min(320, maxHeight) - 6)
              : Math.max(8, rect.bottom + 6)
            setFilterPos({ left, top, width, maxHeight })
          }
          updatePos()
          const dismiss = (event) => {
            const target = event.target
            if (target instanceof Element && (target.closest('.dfl-filter-popover') !== null || target.closest('.dfl-filter-trigger') !== null)) return
            setFilterMenu(null)
          }
          const onKey = (event) => { if (event.key === 'Escape') setFilterMenu(null) }
          window.addEventListener('resize', updatePos)
          document.addEventListener('mousedown', dismiss)
          document.addEventListener('keydown', onKey)
          return () => {
            window.removeEventListener('resize', updatePos)
            document.removeEventListener('mousedown', dismiss)
            document.removeEventListener('keydown', onKey)
          }
        }, [filterMenu])
        const [sourceFilter, setSourceFilter] = useState('all')
        const [archivedOnly, setArchivedOnly] = useState(false)
        const [expandedProjects, setExpandedProjects] = useState(() => new Map())
        const [expandedSessions, setExpandedSessions] = useState(() => new Map())
        const [collapsedCategories, setCollapsedCategories] = useState(() => new Set())
        const [groupModeByTab, setGroupModeByTab] = useState(() => ({
          session: 'category',
          sent: 'project',
          pins: 'project',
          project: 'category',
        }))
        const groupMode = groupModeByTab[scope] || 'category'
        const setGroupModeForActiveTab = useCallback((updater) => {
          setGroupModeByTab(previous => {
            const currentMode = previous[scope] || 'category'
            const nextMode = typeof updater === 'function' ? updater(currentMode) : updater
            return { ...previous, [scope]: nextMode }
          })
        }, [scope])
        const [viewer, setViewer] = useState(null)
        const [viewerState, setViewerState] = useState({ status: 'idle' })
        const viewerUrl = useRef(null)
        const viewerScrollRef = useRef(null)
        const viewerPageRefs = useRef([])
        const [refreshKey, setRefreshKey] = useState(0)
        const [liveTick, setLiveTick] = useState(0)
        const prevViewKeyRef = useRef('')
        const prevRefreshKeyRef = useRef(0)
        const prevLiveTickRef = useRef(0)
        const [toast, setToast] = useState(null)
        const [archiving, setArchiving] = useState(false)
        const [, setAppRevision] = useState(0)
        const appCache = useRef({})
        const dataCache = useRef(new Map())
        const [tabCounts, setTabCounts] = useState({})

        const historyId = regionTarget.kind === 'history-session' ? regionTarget.sessionId : null
        const selectedHistoryProjectCwd = regionTarget.kind === 'history-project' ? regionTarget.cwd : undefined
        const effectiveSessionId = regionTarget.kind === 'history-session'
          ? regionTarget.sessionId
          : regionTarget.kind === 'history-project' && regionTarget.repSessionId
            ? regionTarget.repSessionId
            : sessionId
        const historyRow = useMemo(() => {
          const targetId = regionTarget.kind === 'history-session'
            ? regionTarget.sessionId
            : regionTarget.kind === 'history-project'
              ? regionTarget.repSessionId
              : null
          if (!targetId) return undefined
          return sessions.find(row => row.id === targetId)
            || historySessions.find(row => row.id === targetId)
        }, [regionTarget, sessions, historySessions])
        const inventorySessionId = effectiveSessionId
        const inventoryCwd = regionTarget.kind === 'history-project'
          ? (selectedHistoryProjectCwd || historyRow?.cwd)
          : regionTarget.kind === 'history-session'
            ? (regionTarget.cwd || (historyRow && historyRow.cwd ? historyRow.cwd : undefined))
            : cwd
        const inventoryTitle = regionTarget.kind === 'history-session'
          ? (regionTarget.title || (historyRow && (historyRow.displayTitle || historyRow.title)) || regionTarget.sessionId)
          : regionTarget.kind === 'history-project'
            ? (regionTarget.name || (inventoryCwd ? baseName(inventoryCwd) : t('group.unknown')))
            : sessionTitle
        const inventoryScope = scope === 'project' ? 'project' : scope === 'sent' ? 'sent' : 'session'

        const notify = useCallback((text) => { setToast({ text, at: Date.now() }) }, [])

        /* Health and native availability. */
        useEffect(() => {
          let alive = true
          api('/api/file-launcher.health')
            .then(value => { if (alive) setHealth(value) })
            .catch(() => {})
          return () => { alive = false }
        }, [])

        useEffect(() => {
          let alive = true
          Promise.resolve()
            .then(() => ctx.remote.session.canOpenWorkspacePath())
            .then(value => { if (alive) setDesktop(value.ok === true && value.value === true) })
            .catch(() => { if (alive) setDesktop(false) })
          return () => { alive = false }
        }, [])

        /* Pins. */
        const loadPins = useCallback(async () => {
          try {
            const value = await api('/api/file-launcher.pins')
            setPins(Array.isArray(value.pins) ? value.pins : [])
            setPinsError(value.ok === false ? (value.error || '') : '')
          } catch (caught) {
            setPinsError(caught instanceof Error ? caught.message : String(caught))
          }
        }, [])

        useEffect(() => { void loadPins() }, [loadPins])

        /* Load historical conversations on demand when the top Scope menu opens or when browsing Sent/Project tabs. */
        useEffect(() => {
          if ((!scopeMenuOpen && scope !== 'sent' && scope !== 'project') || historySessions.length > 0) return undefined
          let alive = true
          api('/api/file-launcher.sessions?limit=60')
            .then(value => { if (alive && Array.isArray(value.sessions)) setHistorySessions(value.sessions) })
            .catch(() => {})
          return () => { alive = false }
        }, [scopeMenuOpen, scope, historySessions.length])

        /* Keep sent inventory loaded for Sent-tab isolation & dropdown counts after project prefetch and first paint. */
        useEffect(() => {
          if (typeof sessionId !== 'string' || sessionId.length === 0) {
            setSentData(null)
            return undefined
          }
          if (scope !== 'sent' && !scopeMenuOpen && sentData !== null && refreshKey === 0) return undefined
          if (scope !== 'sent' && !scopeMenuOpen && (data === null || loading)) return undefined
          let alive = true
          const controller = new AbortController()
          const delayMs = scope === 'sent' || scopeMenuOpen ? 0 : 1200
          const timer = setTimeout(() => {
            if (!alive) return
            const parameters = new URLSearchParams({
              sessionId,
              scope: 'sent',
              limit: String(preferences?.maxRows || 1000),
            })
            if (refreshKey > 0) parameters.set('fresh', '1')
            api(`/api/file-launcher.inventory?${parameters.toString()}`, { signal: controller.signal })
              .then(value => {
                if (!alive) return
                if (value && typeof value.durationMs === 'number' && value.durationMs > 0) {
                  scopeDurationRef.current.sent = value.durationMs
                }
                setSentData(value)
              })
              .catch(() => {})
          }, delayMs)
          return () => { alive = false; clearTimeout(timer); controller.abort() }
        }, [sessionId, scope, scopeMenuOpen, refreshKey, liveTick, preferences?.maxRows, data, loading])

        /* Inventory for the current conversation, project, or selected history conversation. */
        useEffect(() => {
          if (scope === 'pins') {
            setLoading(false)
            return undefined
          }
          if (typeof inventorySessionId !== 'string' || inventorySessionId.length === 0) {
            setData(null)
            setLoading(false)
            return undefined
          }
          const cacheKey = `${inventoryScope}:${inventorySessionId}:${refreshKey}:${preferences?.maxRows || 800}`
          const viewKey = `${inventoryScope}:${inventorySessionId}`
          const sameView = prevViewKeyRef.current === viewKey
          prevViewKeyRef.current = viewKey
          const manual = prevRefreshKeyRef.current !== refreshKey
          prevRefreshKeyRef.current = refreshKey
          const live = sameView && !manual && prevLiveTickRef.current !== liveTick
          prevLiveTickRef.current = liveTick
          const cacheTtlMs = inventoryScope === 'project' ? 10_000 : 12_000
          const cached = dataCache.current.get(cacheKey)
          if (!live && cached !== undefined && Date.now() - cached.at < cacheTtlMs) {
            setData(cached.value)
            setError('')
            setLoading(false)
            return undefined
          }
          let alive = true
          const controller = new AbortController()
          const requestStartedAt = Date.now()
          loadingStartedAtRef.current = requestStartedAt
          setLoadElapsedMs(0)
          if (!live) setLoading(true)
          setError('')
          const parameters = new URLSearchParams({
            sessionId: inventorySessionId,
            scope: inventoryScope,
            limit: String(preferences?.maxRows || 800),
          })
          const wantFresh = manual || (live && forceFreshRef.current)
          forceFreshRef.current = false
          if (wantFresh) parameters.set('fresh', '1')
          api(`/api/file-launcher.inventory?${parameters.toString()}`, { signal: controller.signal })
            .then(value => {
              if (!alive) return
              const measuredMs = typeof value?.durationMs === 'number' && value.durationMs > 0
                ? value.durationMs
                : Date.now() - requestStartedAt
              if (measuredMs > 0) scopeDurationRef.current[inventoryScope] = measuredMs
              dataCache.current.set(cacheKey, { at: Date.now(), value })
              // Bound the cache: each entry holds a full inventory payload.
              while (dataCache.current.size > 24) {
                const oldest = dataCache.current.keys().next().value
                dataCache.current.delete(oldest)
              }
              setData(value)
              if (inventoryScope === 'sent') setSentData(value)
              if (inventoryScope === 'project' && inventorySessionId === sessionId && value && Array.isArray(value.files)) {
                const pKey = `${sessionId}:project`
                setTabCounts(prev => prev[pKey] === value.files.length ? prev : { ...prev, [pKey]: value.files.length })
              }
              if (!live) setSelected(new Set())
            })
            .catch(caught => {
              if (!alive || live) return
              setData(null)
              setError(caught instanceof Error ? caught.message : String(caught))
            })
            .finally(() => { if (alive) setLoading(false) })
          return () => { alive = false; controller.abort() }
        }, [scope, regionTarget, inventorySessionId, inventoryScope, refreshKey, liveTick, preferences?.maxRows])

        /* Prefetch current-project inventory early after foreground load settles so switching tabs is instant. */
        useEffect(() => {
          if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
          if (scope === 'project' || data === null || loading) return undefined
          const key = `${sessionId}:project`
          if (tabCounts[key] !== undefined) return undefined
          let alive = true
          const controller = new AbortController()
          const maxRowsVal = String(preferences?.maxRows || 800)
          const pCacheKey = `project:${sessionId}:${refreshKey}:${maxRowsVal}`
          const timer = setTimeout(() => {
            if (!alive) return
            const t0 = Date.now()
            api(`/api/file-launcher.inventory?${new URLSearchParams({ sessionId, scope: 'project', limit: maxRowsVal }).toString()}`, { signal: controller.signal })
              .then(value => {
                if (!alive || !value || !Array.isArray(value.files)) return
                const ms = typeof value.durationMs === 'number' && value.durationMs > 0 ? value.durationMs : Date.now() - t0
                scopeDurationRef.current.project = ms
                dataCache.current.set(pCacheKey, { at: Date.now(), value })
                while (dataCache.current.size > 24) {
                  const oldest = dataCache.current.keys().next().value
                  dataCache.current.delete(oldest)
                }
                setTabCounts(prev => prev[key] === value.files.length ? prev : { ...prev, [key]: value.files.length })
              })
              .catch(() => {})
          }, 180)
          return () => { alive = false; clearTimeout(timer); controller.abort() }
        }, [sessionId, scope, data, loading, refreshKey, preferences?.maxRows])

        /* Tick elapsed time smoothly only while a loading card or preview loader is active on screen. */
        useEffect(() => {
          const isListLoading = loading && scope !== 'pins'
          const isViewerLoading = viewerState.status === 'loading'
          if (!isListLoading && !isViewerLoading) return undefined
          const timer = setInterval(() => {
            const origin = isViewerLoading ? viewerStartedAtRef.current : loadingStartedAtRef.current
            if (origin > 0) setLoadElapsedMs(Math.max(0, Date.now() - origin))
          }, 250)
          return () => clearInterval(timer)
        }, [loading, scope, viewerState.status])

        useEffect(() => {
          applyDocumentTheme(preferences)
        }, [preferences])

        useEffect(() => {
          let alive = true
          api('/api/file-launcher.settings')
            .then(value => {
              if (!alive) return
              setPreferences(value.settings)
              if (!scopeTouched.current && (value.settings.defaultScope === 'sent' || value.settings.defaultScope === 'project')) {
                setScope(value.settings.defaultScope)
              }
            })
            .catch(() => {
              if (alive) setPreferences(previous => ({ ...(previous || {}), ...readLocalAppearance() }))
            })
          return () => { alive = false }
        }, [])

        useEffect(() => {
          const sync = () => setPreferences(previous => ({ ...(previous || {}), ...readLocalAppearance() }))
          const onStorage = event => { if (event.key === APPEARANCE_KEY) sync() }
          const onSettings = event => setPreferences(previous => ({ ...(previous || {}), ...event.detail, ...readLocalAppearance() }))
          window.addEventListener('dfl-appearance', sync)
          window.addEventListener('storage', onStorage)
          window.addEventListener(SETTINGS_EVENT, onSettings)
          return () => {
            window.removeEventListener('dfl-appearance', sync)
            window.removeEventListener('storage', onStorage)
            window.removeEventListener(SETTINGS_EVENT, onSettings)
          }
        }, [])

        useEffect(() => {
          if (viewer !== null) return undefined
          if (scope === 'pins') return undefined
          const rawSeconds = preferences && preferences.autoRefresh === false ? 0 : preferences ? preferences.refreshSeconds : 60
          if (rawSeconds <= 0) return undefined
          const seconds = rawSeconds === 60 ? 10 : rawSeconds
          const timer = setInterval(() => {
            forceFreshRef.current = true
            setLiveTick(value => value + 1)
          }, seconds * 1000)
          return () => clearInterval(timer)
        }, [scope, regionTarget, viewer, preferences])

        /* Immediately capture newly generated files when the active conversation updates or panel regains focus. */
        useEffect(() => {
          const updated = Number(sessionRow?.updatedAt || 0)
          if (updated <= 0 || updated === lastSessionUpdatedRef.current) return undefined
          lastSessionUpdatedRef.current = updated
          const timer = setTimeout(() => {
            forceFreshRef.current = true
            for (const key of [...dataCache.current.keys()]) {
              if (key.includes(`:${sessionId}:`)) dataCache.current.delete(key)
            }
            setTabCounts(prev => {
              const pKey = `${sessionId}:project`
              if (prev[pKey] === undefined) return prev
              const next = { ...prev }
              delete next[pKey]
              return next
            })
            setLiveTick(value => value + 1)
          }, 220)
          return () => clearTimeout(timer)
        }, [sessionId, sessionRow?.updatedAt])

        useEffect(() => {
          if (scope === 'pins' || viewer !== null) return undefined
          const triggerFresh = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
            const now = Date.now()
            if (now - lastFocusSyncRef.current < 2500) return
            lastFocusSyncRef.current = now
            forceFreshRef.current = true
            setLiveTick(value => value + 1)
          }
          window.addEventListener('focus', triggerFresh)
          window.addEventListener('pointerenter', triggerFresh)
          document.addEventListener('visibilitychange', triggerFresh)
          return () => {
            window.removeEventListener('focus', triggerFresh)
            window.removeEventListener('pointerenter', triggerFresh)
            document.removeEventListener('visibilitychange', triggerFresh)
          }
        }, [scope, viewer])

        /* Toast lifetime. */
        useEffect(() => {
          if (toast === null) return undefined
          const timer = setTimeout(() => setToast(null), 3200)
          return () => clearTimeout(timer)
        }, [toast])

        /* Reset the drill-down when the Session changes. */
        useEffect(() => {
          lastSessionUpdatedRef.current = 0
          setRegionTarget({ kind: 'current-session' })
          setData(null)
          setSentData(null)
          setSelected(new Set())
          setViewer(null)
          setViewerState({ status: 'idle' })
          setContextMenu(null)
          setPendingDelete(null)
          setTraceFile(null)
          setFilterMenu(null)
          setScopeMenuOpen(false)
        }, [sessionId])

        /* Pin lookup. */
        const pinKeys = useMemo(() => new Set(pins.map(pin => pathKey(pin.path))), [pins])

        /* Region matcher shared by Sent and Pinned isolation. */
        const matchesRegion = useCallback((file, target = regionTarget) => {
          if (!file) return false
          if (!target || target.kind === 'all') return true
          if (target.kind === 'current-session') {
            return file.sessionId ? file.sessionId === sessionId : false
          }
          if (target.kind === 'history-session') {
            return file.sessionId === target.sessionId
          }
          if (target.kind === 'current-project') {
            if (!cwd) return file.sessionId === sessionId
            const targetKey = pathKey(cwd)
            if (file.cwd) return pathKey(file.cwd) === targetKey
            return file.path ? pathKey(file.path).startsWith(targetKey) : false
          }
          if (target.kind === 'history-project') {
            if (target.cwd) {
              const targetKey = pathKey(target.cwd)
              if (file.cwd) return pathKey(file.cwd) === targetKey
              return file.path ? pathKey(file.path).startsWith(targetKey) : false
            }
            return target.name ? (file.projectName || '') === target.name : false
          }
          return true
        }, [regionTarget, sessionId, cwd])

        /* The panel's raw rows. */
        const pinRows = useMemo(() => {
          const sessionTitleById = new Map(sessions.map(row => [row.id, row.displayTitle || row.title]))
          for (const row of historySessions) {
            if (row && row.id && !sessionTitleById.has(row.id) && row.title) sessionTitleById.set(row.id, row.title)
          }
          return pins.map(pin => {
            const name = pin.name || baseName(pin.path)
            const rowCwd = pin.cwd || ''
            return {
              path: pin.path,
              name,
              rel: relativeOf(pin.path, rowCwd || cwd),
              category: categoryOf(name || pin.path),
              source: 'pinned',
              description: pin.description,
              sessionId: pin.sessionId,
              sessionTitle: pin.sessionId ? sessionTitleById.get(pin.sessionId) : undefined,
              cwd: rowCwd,
              projectName: rowCwd ? baseName(rowCwd) : undefined,
              mtime: pin.addedAt,
              addedAt: pin.addedAt,
            }
          })
        }, [pins, sessions, historySessions, cwd])

        const sentAllRows = useMemo(() => {
          if (sentData && Array.isArray(sentData.files)) return sentData.files
          if (data && data.scope === 'sent' && Array.isArray(data.files)) return data.files
          return []
        }, [sentData, data])

        const currentData = data && data.scope === inventoryScope
          && (inventoryScope === 'sent' || data.sessionId === inventorySessionId) ? data : null

        const baseFiles = useMemo(() => {
          if (scope === 'pins') return pinRows.filter(row => matchesRegion(row, regionTarget))
          if (scope === 'sent') return sentAllRows.filter(row => matchesRegion(row, regionTarget))
          const rows = currentData ? currentData.files : []
          // "本次产出" stays focused on AI outputs/reads of the conversation, never duplicating "我发送的".
          if (scope === 'session') return rows.filter(file => file.source !== 'attachment')
          return rows
        }, [scope, pinRows, sentAllRows, currentData, matchesRegion, regionTarget])

        useEffect(() => {
          if (!currentData) return
          const key = `${inventorySessionId || 'default'}:${inventoryScope}`
          const rows = Array.isArray(currentData.files) ? currentData.files : []
          const count = inventoryScope === 'session'
            ? rows.filter(f => f.source !== 'attachment' && !(f.source === 'read' && !isReadableFile(f))).length
            : rows.length
          setTabCounts(prev => prev[key] === count ? prev : { ...prev, [key]: count })
        }, [currentData, inventoryScope, inventorySessionId])

        const matchesQuery = (file) => {
          const needle = query.trim().toLowerCase()
          if (needle.length === 0) return true
          const categoryText = t(CATEGORY_LABELS[file.category] || 'filter.other')
          return `${file.name} ${file.rel} ${file.path} ${file.description || ''} ${file.projectName || ''} ${file.sessionTitle || ''} ${categoryText} ${file.reference ? '引用 reference' : ''}`.toLowerCase().includes(needle)
        }

        const isVisibleInDefaultAll = useCallback((file) => {
          if (scope === 'session') return file.source !== 'attachment' && !(file.source === 'read' && !isReadableFile(file))
          return true
        }, [scope])

        const fileMatchesSource = useCallback((file, filter) => {
          if (!filter || filter === 'all') return true
          if (filter === 'pinned') return pinKeys.has(pathKey(file.path))
          return matchesSourceFilter(file, filter)
        }, [pinKeys])

        const categoryCounts = useMemo(() => {
          const counts = {}
          let allRecommended = 0
          const hasFilter = sourceFilter !== 'all' || query.trim().length > 0 || archivedOnly
          for (const file of baseFiles) {
            if (!matchesQuery(file)) continue
            if (!fileMatchesSource(file, sourceFilter)) continue
            if (archivedOnly && file.archived !== true) continue
            const cat = file.category || categoryOf(file)
            counts[cat] = (counts[cat] || 0) + 1
            if (hasFilter || isVisibleInDefaultAll(file)) {
              allRecommended += 1
            }
          }
          return { counts, total: allRecommended }
        }, [baseFiles, query, sourceFilter, archivedOnly, fileMatchesSource, isVisibleInDefaultAll])

        const sourceCounts = useMemo(() => {
          const counts = {}
          let total = 0
          for (const file of baseFiles) {
            if (!matchesQuery(file)) continue
            if (archivedOnly && file.archived !== true) continue
            counts[file.source] = (counts[file.source] || 0) + 1
            if (file.reference === true) counts.reference = (counts.reference || 0) + 1
            if (pinKeys.has(pathKey(file.path))) counts.pinned = (counts.pinned || 0) + 1
            total += 1
          }
          return { counts, total }
        }, [baseFiles, query, archivedOnly, pinKeys])

        const archivedCount = useMemo(() => {
          let total = 0
          for (const file of baseFiles) {
            if (file.archived !== true) continue
            if (!matchesQuery(file)) continue
            if (category !== 'all' && file.category !== category) continue
            if (!fileMatchesSource(file, sourceFilter)) continue
            total += 1
          }
          return total
        }, [baseFiles, query, category, sourceFilter, fileMatchesSource])

        const visibleFiles = useMemo(() => {
          let rows = baseFiles.slice()
          rows = rows.filter(matchesQuery)
          if (sourceFilter !== 'all') rows = rows.filter(file => fileMatchesSource(file, sourceFilter))
          if (archivedOnly) rows = rows.filter(file => file.archived === true)
          if (category !== 'all') {
            rows = rows.filter(file => (file.category || categoryOf(file)) === category)
          } else if (sourceFilter === 'all' && query.trim().length === 0 && !archivedOnly) {
            rows = rows.filter(isVisibleInDefaultAll)
          }
          rows.sort((left, right) => {
            if (scope === 'session') {
              const lp = pinKeys.has(pathKey(left.path))
              const rp = pinKeys.has(pathKey(right.path))
              if (lp !== rp) return lp ? -1 : 1
            }
            if (sort === 'name') return String(left.name).localeCompare(String(right.name), undefined, { sensitivity: 'base' })
            if (sort === 'type') {
              const byType = String(left.category).localeCompare(String(right.category))
              if (byType !== 0) return byType
              return String(left.name).localeCompare(String(right.name), undefined, { sensitivity: 'base' })
            }
            if (sort === 'timeAsc') return (left.mtime || left.addedAt || 0) - (right.mtime || right.addedAt || 0)
            return (right.mtime || right.addedAt || 0) - (left.mtime || left.addedAt || 0)
          })
          return rows
        }, [baseFiles, query, category, sort, sourceFilter, archivedOnly, scope, pinKeys, isVisibleInDefaultAll])

        const fileGroups = useMemo(() => {
          if (groupMode !== 'project') return null
          const activeProjCwd = regionTarget.kind === 'history-project'
            ? regionTarget.cwd
            : regionTarget.kind === 'history-session'
              ? (regionTarget.cwd || inventoryCwd)
              : cwd
          const projects = new Map()
          for (const file of visibleFiles) {
            const fileCwd = file.cwd || (file.sessionId === sessionId ? cwd : '')
            const rawProjectKey = fileCwd
              ? pathKey(fileCwd)
              : file.projectName
                ? `name:${String(file.projectName).toLowerCase()}`
                : '__standalone__'
            let project = projects.get(rawProjectKey)
            if (project === undefined) {
              const name = file.projectName || (fileCwd ? baseName(fileCwd) : t('group.standalone'))
              project = {
                key: rawProjectKey,
                name,
                path: fileCwd || '',
                isCurrent: Boolean(
                  (activeProjCwd && fileCwd && pathKey(fileCwd) === pathKey(activeProjCwd))
                  || (!fileCwd && rawProjectKey === '__standalone__' && !activeProjCwd),
                ),
                files: 0,
                latestTime: 0,
                sessions: new Map(),
              }
              projects.set(rawProjectKey, project)
            }
            const isWorkspace = file.source === 'workspace'
            const rowSessionId = file.sessionId || inventorySessionId || sessionId || 'session'
            const sessionKey = isWorkspace ? 'workspace' : rowSessionId
            let session = project.sessions.get(sessionKey)
            if (session === undefined) {
              const isCurrentSession = !isWorkspace && (sessionKey === sessionId || sessionKey === inventorySessionId)
              session = {
                key: sessionKey,
                isCurrent: isCurrentSession,
                latestTime: 0,
                name: isWorkspace
                  ? t('group.workspace')
                  : file.sessionTitle
                    || (sessionKey === inventorySessionId ? inventoryTitle : undefined)
                    || (sessionKey === sessionId ? sessionTitle : undefined)
                    || `${t('group.untitled')} (${String(sessionKey).slice(0, 6)})`,
                files: [],
              }
              project.sessions.set(sessionKey, session)
            }
            const fileTime = Number(file.mtime || file.addedAt || 0)
            if (fileTime > session.latestTime) session.latestTime = fileTime
            if (fileTime > project.latestTime) project.latestTime = fileTime
            if (session.isCurrent) project.isCurrent = true
            session.files.push(file)
            project.files += 1
          }
          return [...projects.values()]
            .sort((a, b) => ((b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0)) || (b.latestTime - a.latestTime))
            .map(project => ({
              ...project,
              sessions: [...project.sessions.values()]
                .sort((a, b) => ((b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0)) || (b.latestTime - a.latestTime)),
            }))
        }, [visibleFiles, regionTarget, inventoryCwd, inventorySessionId, inventoryTitle, sessionId, sessionTitle, cwd, t, groupMode])

        const categoryGroups = useMemo(() => {
          if (groupMode !== 'category' || category !== 'all') return null
          const buckets = new Map()
          for (const file of visibleFiles) {
            const key = file.category || categoryOf(file) || 'other'
            let group = buckets.get(key)
            if (group === undefined) {
              group = { key, files: [], filesCount: 0 }
              buckets.set(key, group)
            }
            group.files.push(file)
            group.filesCount += 1
          }
          const ordered = []
          for (const key of CATEGORY_ORDER) {
            const hit = buckets.get(key)
            if (hit) ordered.push(hit)
          }
          for (const [key, hit] of buckets.entries()) {
            if (!CATEGORY_ORDER.includes(key)) ordered.push(hit)
          }
          return ordered
        }, [visibleFiles, category, groupMode])

        const selectedFiles = useMemo(
          () => baseFiles.filter(file => selected.has(fileRowKey(file))),
          [baseFiles, selected],
        )

        /* List of history sessions shown inside the top Scope dropdown. */
        const historyOptions = useMemo(() => {
          const merged = new Map()
          for (const row of historySessions) {
            merged.set(row.id, {
              id: row.id,
              title: row.title || baseName(row.cwd || '') || row.id,
              displayTitle: row.title || baseName(row.cwd || '') || row.id,
              cwd: row.cwd,
              updatedAt: row.createdAt || 0,
            })
          }
          for (const row of sessions) {
            merged.set(row.id, {
              id: row.id,
              title: row.title,
              displayTitle: row.displayTitle || row.title || row.id,
              cwd: row.cwd,
              updatedAt: row.updatedAt || 0,
            })
          }
          return [...merged.values()]
            .filter(row => row.id !== sessionId)
            .sort((left, right) => right.updatedAt - left.updatedAt)
        }, [historySessions, sessions, sessionId])

        const historyGroups = useMemo(() => {
          const groups = new Map()
          for (const row of historyOptions) {
            const key = row.cwd ? slashPath(row.cwd).toLowerCase() : ''
            let group = groups.get(key)
            if (group === undefined) {
              group = {
                key,
                cwd: row.cwd,
                name: row.cwd ? baseName(row.cwd) : t('history.noProject'),
                sessions: [],
                updatedAt: 0,
              }
              groups.set(key, group)
            }
            group.sessions.push(row)
            group.updatedAt = Math.max(group.updatedAt, row.updatedAt || 0)
          }
          return [...groups.values()].sort((left, right) => right.updatedAt - left.updatedAt)
        }, [historyOptions, t])

        const buildScopeTree = useCallback((rows) => {
          const projects = new Map()
          let curSessionCount = 0
          let curProjectCount = 0
          for (const row of rows) {
            if (row.sessionId && row.sessionId === sessionId) curSessionCount += 1
            const rowCwd = row.cwd || ''
            const inCurProj = Boolean(cwd && (
              (rowCwd && pathKey(rowCwd) === pathKey(cwd))
              || (!rowCwd && row.path && pathKey(row.path).startsWith(pathKey(cwd)))
            ))
            if (inCurProj || (!cwd && row.sessionId === sessionId)) curProjectCount += 1
            const pKey = rowCwd
              ? pathKey(rowCwd)
              : row.projectName
                ? `name:${String(row.projectName).toLowerCase()}`
                : '__standalone__'
            let proj = projects.get(pKey)
            if (proj === undefined) {
              proj = {
                key: pKey,
                cwd: rowCwd,
                name: row.projectName || (rowCwd ? baseName(rowCwd) : t('group.standalone')),
                isCurrent: inCurProj,
                count: 0,
                latestTime: 0,
                repSessionId: row.sessionId || sessionId,
                sessions: new Map(),
              }
              projects.set(pKey, proj)
            }
            proj.count += 1
            const tm = Number(row.mtime || row.addedAt || 0)
            if (tm > proj.latestTime) proj.latestTime = tm
            if (inCurProj) proj.isCurrent = true
            const sId = row.sessionId || '__none__'
            let sess = proj.sessions.get(sId)
            if (sess === undefined) {
              sess = {
                id: sId,
                isCurrent: sId === sessionId,
                title: row.sessionTitle || (sId === sessionId ? sessionTitle : `${t('group.untitled')} (${String(sId).slice(0, 6)})`),
                cwd: rowCwd,
                count: 0,
                latestTime: 0,
              }
              proj.sessions.set(sId, sess)
            }
            sess.count += 1
            if (tm > sess.latestTime) sess.latestTime = tm
          }
          const sortedProjects = [...projects.values()]
            .sort((a, b) => ((b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0)) || (b.latestTime - a.latestTime))
            .map(proj => ({
              ...proj,
              sessions: [...proj.sessions.values()]
                .sort((a, b) => ((b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0)) || (b.latestTime - a.latestTime)),
            }))
          return { total: rows.length, curSessionCount, curProjectCount, projects: sortedProjects }
        }, [sessionId, sessionTitle, cwd, t])

        const sentScopeStats = useMemo(() => buildScopeTree(sentAllRows), [sentAllRows, buildScopeTree])
        const pinScopeStats = useMemo(() => buildScopeTree(pinRows), [pinRows, buildScopeTree])

        const projectDirectories = useMemo(() => {
          const byCwd = new Map()
          const addSession = (s) => {
            if (!s || !s.cwd) return
            const key = pathKey(s.cwd)
            let item = byCwd.get(key)
            if (item === undefined) {
              item = {
                key,
                cwd: s.cwd,
                name: baseName(s.cwd),
                repSessionId: s.id,
                isCurrent: Boolean(cwd && pathKey(cwd) === key),
                updatedAt: s.updatedAt || 0,
                sessionCount: 0,
              }
              byCwd.set(key, item)
            }
            item.sessionCount += 1
            if ((s.updatedAt || 0) >= item.updatedAt) {
              item.updatedAt = s.updatedAt || 0
              item.repSessionId = s.id
            }
          }
          if (cwd && sessionId) {
            addSession({ id: sessionId, cwd, updatedAt: Date.now() })
          }
          for (const row of historyOptions) addSession(row)
          return [...byCwd.values()]
            .sort((a, b) => ((b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0)) || (b.updatedAt - a.updatedAt))
        }, [historyOptions, cwd, sessionId])

        /* ─────────────────────────── actions ─────────────────────────── */

        const preview = useCallback((file) => {
          if (!file || typeof file.path !== 'string') return
          const targetSession = file.sessionId || inventorySessionId || sessionId
          const targetCwd = file.cwd || inventoryCwd
          if (typeof targetSession !== 'string' || targetSession.length === 0) {
            notify(t('toast.previewUnavailable'))
            return
          }
          const address = fileAddressFor(targetSession, targetCwd, file.previewPath || file.path)
          try {
            if (panel && panel.isFloating) tab.actions.openResource(address)
            else tab.actions.openResource(address, panel ? { paneId: panel.id } : undefined)
          } catch (caught) {
            notify(t('toast.failed', { message: caught instanceof Error ? caught.message : String(caught) }))
          }
        }, [tab, panel, inventorySessionId, inventoryCwd, sessionId, notify, t])

        const openViewer = useCallback((file) => {
          if (!file) return
          if (!canPanelPreview(file)) {
            preview(file)
            return
          }
          const items = visibleFiles.filter(item => {
            if (isImageFile(file)) return isImageFile(item)
            if (isOfficeFile(file)) return isOfficeFile(item)
            if (isPdfFile(file)) return isPdfFile(item)
            return canPanelPreview(item) && !isImageFile(item) && !isOfficeFile(item) && !isPdfFile(item)
          })
          const index = Math.max(0, items.findIndex(item => item.path === file.path
            && (item.sessionId || '') === (file.sessionId || '')))
          setViewer({ items: items.length > 0 ? items : [file], index })
          setContextMenu(null)
        }, [visibleFiles, preview])

        const moveViewer = useCallback((delta) => {
          setViewer(previous => {
            if (previous === null || previous.items.length < 2) return previous
            const length = previous.items.length
            return { ...previous, index: (previous.index + delta + length) % length }
          })
        }, [])

        const renderPdfPages = useCallback(async (source, file, signal) => {
          const payload = source && typeof source === 'object' && typeof source.path === 'string' && !(source instanceof Uint8Array) && !(source instanceof ArrayBuffer)
            ? {
                path: source.path,
                ...(source.cwd ? { cwd: source.cwd } : {}),
                maxPages: preferences?.pdfMaxPages || 20,
                dpi: preferences?.pdfDpi || 110,
              }
            : {
                data: bytesToBase64(source),
                maxPages: preferences?.pdfMaxPages || 20,
                dpi: preferences?.pdfDpi || 110,
              }
          const result = await api('/api/file-launcher.pdf-pages', {
            method: 'POST',
            body: JSON.stringify(payload),
            signal,
          })
          signal?.throwIfAborted()
          if (result.ok !== true || !Array.isArray(result.pages) || result.pages.length === 0) {
            throw new Error(result.error || t('viewer.renderFailed'))
          }
          viewerPageRefs.current = []
          const pagePayload = {
            status: 'pages',
            pages: result.pages,
            totalPages: result.totalPages || result.pages.length,
            truncated: result.truncated === true,
          }
          if (file?.path) {
            const vKey = `${file.path}:${file.size || 0}:${file.mtime || 0}`
            viewerCacheRef.current.set(vKey, pagePayload)
            while (viewerCacheRef.current.size > 8) {
              viewerCacheRef.current.delete(viewerCacheRef.current.keys().next().value)
            }
          }
          setViewerState({
            ...pagePayload,
            file,
            page: 0,
            fit: true,
            zoom: 1,
          })
        }, [t, preferences?.pdfMaxPages, preferences?.pdfDpi])

        const goViewerPage = useCallback((delta) => {
          setViewerState(previous => {
            if (previous.status !== 'pages') return previous
            const page = Math.max(0, Math.min(previous.pages.length - 1, previous.page + delta))
            requestAnimationFrame(() => {
              viewerPageRefs.current[page]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
            })
            return { ...previous, page }
          })
        }, [])

        const zoomViewer = useCallback((delta) => {
          setViewerState(previous => {
            if (previous.status !== 'pages') return previous
            return { ...previous, fit: false, zoom: Math.max(0.5, Math.min(2.5, previous.zoom + delta)) }
          })
        }, [])

        const toggleViewerFit = useCallback(() => {
          setViewerState(previous => previous.status === 'pages' ? { ...previous, fit: !previous.fit } : previous)
        }, [])

        const onViewerPagesScroll = useCallback((event) => {
          const container = event.currentTarget
          const nodes = [...container.querySelectorAll('.dfl-pdf-page')]
          let page = 0
          for (let index = 0; index < nodes.length; index += 1) {
            if (nodes[index].offsetTop - 24 <= container.scrollTop) page = index
          }
          setViewerState(previous => previous.status === 'pages' && previous.page !== page ? { ...previous, page } : previous)
        }, [])

        useEffect(() => {
          if (viewer === null) {
            setViewerState({ status: 'idle' })
            return undefined
          }
          const file = viewer.items[viewer.index]
          if (file === undefined) return undefined
          const vKey = `${file.path}:${file.size || 0}:${file.mtime || 0}`
          const cachedPages = viewerCacheRef.current.get(vKey)
          if (cachedPages !== undefined) {
            viewerPageRefs.current = []
            setViewerState({ ...cachedPages, file, page: 0, fit: true, zoom: 1 })
            return undefined
          }
          const controller = new AbortController()
          let objectUrl
          const sourceSession = file.sessionId || inventorySessionId || sessionId
          const sourcePath = file.previewPath || file.path
          viewerStartedAtRef.current = Date.now()
          setLoadElapsedMs(0)
          setViewerState({ status: 'loading', file })
          void (async () => {
            try {
              if (isOfficeFile(file)) {
                const officeKit = officeKitRef?.value || (ctx.remote && ctx.remote.officeKit)
                if (officeKit === undefined) {
                  throw new Error(health && health.officeKit === false
                    ? t('viewer.officeHostMissing')
                    : t('viewer.officeUnavailable'))
                }
                const result = await officeKit.render(sourceSession, file.path, 'foreground', controller.signal)
                controller.signal.throwIfAborted()
                if (!result.ok) throw new Error(result.error?.message || t('viewer.failed'))
                await renderPdfPages(result.value.data, file, controller.signal)
                return
              }
              if (isPdfFile(file)) {
                if (file.path) {
                  try {
                    await renderPdfPages({ path: file.path, cwd: file.cwd || inventoryCwd || '' }, file, controller.signal)
                    return
                  } catch (error) {
                    if (controller.signal.aborted) throw error
                  }
                }
                const result = await ctx.remote.workspaceFiles.readBytes(sourceSession, sourcePath, {}, controller.signal)
                controller.signal.throwIfAborted()
                if (!result.ok) throw new Error(result.error?.message || t('viewer.failed'))
                await renderPdfPages(result.value && result.value.data ? result.value.data : result.value, file, controller.signal)
                return
              }
              if (isImageFile(file)) {
                const result = await ctx.remote.workspaceFiles.readBytes(sourceSession, sourcePath, {}, controller.signal)
                controller.signal.throwIfAborted()
                if (!result.ok) throw new Error(result.error?.message || t('viewer.failed'))
                const bytes = result.value && result.value.data ? result.value.data : result.value
                objectUrl = URL.createObjectURL(new Blob([bytes], { type: imageMime(file.name) }))
                viewerUrl.current = objectUrl
                setViewerState({ status: 'image', url: objectUrl, file })
                return
              }
              const result = await ctx.remote.workspaceFiles.read(sourceSession, sourcePath, { offset: 1 }, controller.signal)
              controller.signal.throwIfAborted()
              if (!result.ok) throw new Error(result.error?.message || t('viewer.failed'))
              setViewerState({ status: 'text', text: result.value.text, truncated: Boolean(result.value.truncated), file })
            } catch (error) {
              if (controller.signal.aborted) return
              setViewerState({
                status: 'error',
                error: error instanceof Error ? error.message : String(error),
                file,
              })
            }
          })()
          return () => {
            controller.abort()
            if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl)
            if (viewerUrl.current === objectUrl) viewerUrl.current = null
          }
        }, [viewer, ctx, inventorySessionId, sessionId, t, renderPdfPages, health])

        useEffect(() => {
          if (viewer === null) return undefined
          const onKey = (event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              if (contextMenu !== null) {
                setContextMenu(null)
                return
              }
              if (traceFile !== null) {
                setTraceFile(null)
                return
              }
              setViewer(null)
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault()
              if (viewerState.status === 'pages') goViewerPage(-1)
              else moveViewer(-1)
            } else if (event.key === 'ArrowRight') {
              event.preventDefault()
              if (viewerState.status === 'pages') goViewerPage(1)
              else moveViewer(1)
            }
          }
          window.addEventListener('keydown', onKey)
          return () => window.removeEventListener('keydown', onKey)
        }, [viewer, moveViewer, goViewerPage, viewerState.status, contextMenu, traceFile])

        const loadApps = useCallback(async (file) => {
          if (!file || typeof file.path !== 'string') return
          const key = file.path
          const cached = appCache.current[key]
          if (cached && (cached.loading || cached.loaded)) return
          appCache.current[key] = { loading: true, loaded: false, list: [] }
          setAppRevision(value => value + 1)
          const mergeAppLists = (nativeList, detectedList) => {
            const merged = []
            const findExisting = (candidate) => {
              const candName = String(candidate.name || candidate.id || '').toLowerCase().replace(/\s+/g, '')
              const candExe = candidate.exe ? baseName(candidate.exe).toLowerCase().replace(/\.exe$/i, '') : ''
              return merged.find(item => {
                const itemName = String(item.name || item.id || '').toLowerCase().replace(/\s+/g, '')
                const itemExe = item.exe ? baseName(item.exe).toLowerCase().replace(/\.exe$/i, '') : ''
                if (itemName && candName && (itemName === candName || itemName.includes(candName) || candName.includes(itemName))) return true
                if (itemExe && candExe && itemExe === candExe && (!item.id?.includes('wps-') && !candidate.id?.includes('wps-'))) return true
                return false
              })
            }
            for (const app of nativeList) {
              merged.push({
                id: app.id,
                nativeId: app.id,
                name: app.name || app.id,
                ...(app.default ? { default: true } : {}),
              })
            }
            for (const app of detectedList) {
              const hit = findExisting(app)
              if (hit !== undefined) {
                hit.serverAppId = app.id
                if (!hit.exe && app.exe) hit.exe = app.exe
                if (app.default) hit.default = true
              } else {
                merged.push({
                  id: `app:${app.id}`,
                  serverAppId: app.id,
                  name: app.name || app.id,
                  exe: app.exe,
                  ...(app.default ? { default: true } : {}),
                })
              }
            }
            return merged.sort((a, b) => (b.default ? 1 : 0) - (a.default ? 1 : 0))
          }
          try {
            const [nativeRes, detectedRes] = await Promise.allSettled([
              ctx.remote.session.workspacePathApplications({ path: file.path }),
              api(`/api/file-launcher.apps?path=${encodeURIComponent(file.path)}`),
            ])
            const nativeList = nativeRes.status === 'fulfilled' && nativeRes.value?.ok === true && Array.isArray(nativeRes.value.value)
              ? nativeRes.value.value
              : []
            const detectedList = detectedRes.status === 'fulfilled' && detectedRes.value?.ok === true && Array.isArray(detectedRes.value.apps)
              ? detectedRes.value.apps
              : []
            const detectStatus = detectedRes.status === 'rejected' && detectedRes.reason && typeof detectedRes.reason.status === 'number'
              ? detectedRes.reason.status
              : 0
            const hostOutdated = detectedRes.status === 'rejected' && detectStatus === 404
            const merged = mergeAppLists(nativeList, detectedList)
            appCache.current[key] = {
              loading: false,
              loaded: !hostOutdated && (merged.length > 0 || detectedRes.status === 'fulfilled'),
              hostOutdated,
              list: merged,
            }
          } catch (caught) {
            appCache.current[key] = { loading: false, loaded: false, list: [], error: caught instanceof Error ? caught.message : String(caught) }
          }
          setAppRevision(value => value + 1)
        }, [ctx])

        const openNative = useCallback(async (file, application) => {
          const isObj = application !== undefined && application !== null && typeof application === 'object'
          const nativeId = isObj ? application.nativeId : application
          const serverAppId = isObj ? application.serverAppId : undefined
          try {
            if (nativeId || !serverAppId) {
              const request = { path: file.path, ...(nativeId ? { application: nativeId } : {}) }
              const result = await ctx.remote.session.openWorkspacePath(request)
              if (result.ok === true) {
                notify(t('toast.opened'))
                return
              }
              if (!serverAppId) {
                notify(t('toast.failed', { message: result.error ? result.error.message : 'open failed' }))
                return
              }
            }
            if (serverAppId) {
              await api('/api/file-launcher.open-app', {
                method: 'POST',
                body: JSON.stringify({
                  path: file.path,
                  appId: serverAppId,
                  ...(file.cwd || inventoryCwd ? { cwd: file.cwd || inventoryCwd } : {}),
                }),
              })
              notify(t('toast.opened'))
            }
          } catch (caught) {
            notify(t('toast.failed', { message: caught instanceof Error ? caught.message : String(caught) }))
          }
        }, [ctx, inventoryCwd, notify, t])

        const reveal = useCallback(async (file) => {
          try {
            const result = await ctx.remote.session.openWorkspacePath({ path: file.path, action: 'reveal' })
            if (result.ok === true) notify(t('toast.revealed'))
            else notify(t('toast.failed', { message: result.error ? result.error.message : 'reveal failed' }))
          } catch (caught) {
            notify(t('toast.failed', { message: caught instanceof Error ? caught.message : String(caught) }))
          }
        }, [ctx, notify, t])

        const openFolder = useCallback(async (file) => {
          try {
            await api('/api/file-launcher.open-folder', {
              method: 'POST',
              body: JSON.stringify({ path: file.path, ...(file.cwd || inventoryCwd ? { cwd: file.cwd || inventoryCwd } : {}) }),
            })
            notify(t('toast.folderOpened'))
          } catch (caught) {
            notify(t('toast.failed', { message: caught instanceof Error ? caught.message : String(caught) }))
          }
        }, [inventoryCwd, notify, t])

        const forgetMissing = useCallback(async (file) => {
          try {
            await api('/api/file-launcher.forget', {
              method: 'POST',
              body: JSON.stringify({ path: file.path }),
            })
            setData(previous => previous === null ? previous : {
              ...previous,
              files: previous.files.filter(row => pathKey(row.path) !== pathKey(file.path)),
            })
            notify(t('toast.forgot'))
          } catch (caught) {
            notify(t('toast.failed', { message: caught instanceof Error ? caught.message : String(caught) }))
          }
        }, [notify, t])

        const openAs = useCallback(async (file) => {
          try {
            await api('/api/file-launcher.open-as', { method: 'POST', body: JSON.stringify({ path: file.path, cwd: file.cwd || inventoryCwd }) })
            notify(t('toast.openAs'))
          } catch (caught) {
            notify(t('toast.failed', { message: caught instanceof Error ? caught.message : String(caught) }))
          }
        }, [inventoryCwd, notify, t])

        const copyPath = useCallback(async (file) => {
          const ok = await copyText(file.path)
          notify(ok ? t('toast.copied') : t('toast.copyFailed'))
        }, [notify, t])

        const copyReference = useCallback(async (files) => {
          const text = files.map(file => referenceText(file.path, cwd)).join(' ')
          const ok = await copyText(text)
          notify(ok ? t('toast.copied') : t('toast.copyFailed'))
        }, [cwd, notify, t])

        const insertReferences = useCallback(async (files, { absolute = false, quiet = false } = {}) => {
          if (files.length === 0) return 'empty'
          const text = `${files.map(file => referenceText(file.path, absolute ? undefined : cwd)).join(' ')} `
          if (inputActions && typeof inputActions.captureInsertion === 'function' && typeof inputActions.insertText === 'function') {
            try {
              // A first insert can be rejected when another selection consumed
              // the captured revision; retry once with a fresh span.
              for (let attempt = 0; attempt < 2; attempt += 1) {
                const span = inputActions.captureInsertion()
                if (inputActions.insertText(text, span)) {
                  if (!quiet) notify(t('toast.added'))
                  return 'inserted'
                }
              }
            } catch {
              // Composer unavailable; try the DOM fallback, then copy.
            }
          }
          if (insertComposerTextFallback(text)) {
            if (!quiet) notify(t('toast.added'))
            return 'inserted'
          }
          const ok = await copyText(text)
          if (!quiet) notify(ok ? t('toast.copied') : t('toast.copyFailed'))
          return ok ? 'copied' : 'failed'
        }, [inputActions, cwd, notify, t])

        /**
         * Add files to the composer as real draft attachments by handing the
         * browser a File drop on the Lexical editor. The composer's normal drop
         * pipeline uploads them and renders removable attachment cards. If the
         * composer cannot accept a drop, fall back to plain reference text.
         */
        const attachToComposer = useCallback(async (files) => {
          if (files.length === 0) return
          const target = typeof document === 'undefined'
            ? null
            : document.querySelector('[data-composer-card]') || document.querySelector('[contenteditable="true"]')
          const fileDrag = ctx.fileDrag || (typeof ctx.get === 'function' ? ctx.get('fileDrag') : undefined)
          if (target === null || typeof DataTransfer === 'undefined' || typeof DragEvent === 'undefined' || fileDrag === undefined) {
            await insertReferences(files, { absolute: true })
            return
          }
          const controller = new AbortController()
          let added = 0
          const references = []
          for (const file of files) {
            let prepared
            try {
              controller.signal.throwIfAborted()
              if (added >= 4 || file.isFolder === true || file.missing === true
                || typeof file.size === 'number' && file.size > 25 * 1024 * 1024) {
                references.push(file)
                continue
              }
              const fileSession = file.sessionId || inventorySessionId || sessionId
              const result = await ctx.remote.workspaceFiles.readBytes(fileSession, file.previewPath || file.path, {}, controller.signal)
              if (!result.ok) { references.push(file); continue }
              const bytes = result.value && result.value.data ? result.value.data : result.value
              if (bytes.byteLength > 25 * 1024 * 1024) { references.push(file); continue }
              const mediaType = isImageFile(file) ? imageMime(file.name) : isPdfFile(file) ? 'application/pdf' : 'application/octet-stream'
              prepared = await fileDrag.actions.prepare({
                kind: 'blob',
                blob: new File([bytes], file.name || 'file', { type: mediaType }),
                name: file.name || 'file',
                mediaType,
              }, controller.signal)
              const transfer = new DataTransfer()
              if (!prepared.start(transfer, new EventTarget())) {
                prepared.release()
                prepared = undefined
                references.push(file)
                continue
              }
              for (const type of ['dragenter', 'dragover', 'drop']) {
                target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }))
              }
              setTimeout(() => {
                try {
                  if (typeof prepared.release === 'function') prepared.release()
                } catch {}
              }, 150)
              added += 1
            } catch {
              prepared?.release()
              references.push(file)
            }
          }
          if (references.length > 0) {
            const fallback = await insertReferences(references, { absolute: true, quiet: true })
            notify(t(fallback === 'inserted' ? 'toast.attachedWithReferences'
              : fallback === 'copied' ? 'toast.attachedWithCopiedReferences' : 'toast.attachedPartialFailure', {
              count: added, references: references.length,
            }))
          } else if (added > 0) notify(t('toast.attached'))
        }, [ctx, inputActions, inventoryCwd, insertReferences, inventorySessionId, notify, sessionId, t])

        const addPins = useCallback(async (files) => {
          if (files.length === 0) return
          try {
            const result = await api('/api/file-launcher.pins', {
              method: 'POST',
              body: JSON.stringify({
                action: 'add',
                paths: files.map(file => file.path),
                ...(files[0].sessionId ? { sessionId: files[0].sessionId } : {}),
                ...(files[0].cwd || inventoryCwd ? { cwd: files[0].cwd || inventoryCwd } : {}),
              }),
            })
            setPins(Array.isArray(result.pins) ? result.pins : [])
            const rejected = Array.isArray(result.rejected) ? result.rejected.length : 0
            notify(rejected > 0 ? t('toast.pinnedPartial', { count: files.length - rejected, rejected }) : t('toast.pinned', { count: files.length }))
          } catch (caught) {
            notify(t('toast.failed', { message: caught instanceof Error ? caught.message : String(caught) }))
          }
        }, [inventoryCwd, notify, t])

        const removePins = useCallback(async (files) => {
          if (files.length === 0) return
          try {
            const result = await api('/api/file-launcher.pins', {
              method: 'POST',
              body: JSON.stringify({ action: 'remove', paths: files.map(file => file.path) }),
            })
            setPins(Array.isArray(result.pins) ? result.pins : [])
            notify(t('toast.unpinned', { count: files.length }))
          } catch (caught) {
            notify(t('toast.failed', { message: caught instanceof Error ? caught.message : String(caught) }))
          }
        }, [notify, t])

        const archiveFiles = useCallback(async (files) => {
          if (files.length === 0) return
          setArchiving(true)
          try {
            const uniquePaths = [...new Set(files.map(file => file.path).filter(Boolean))]
            const result = await api('/api/file-launcher.archive', {
              method: 'POST',
              body: JSON.stringify({
                paths: uniquePaths,
                ...(files[0]?.cwd || inventoryCwd ? { cwd: files[0]?.cwd || inventoryCwd } : {}),
              }),
            })
            const copiedList = Array.isArray(result.copied) ? result.copied : []
            const copied = copiedList.length
            const failed = Array.isArray(result.failed) ? result.failed.length : 0
            if (copied > 0) {
              const archivedKeys = new Set(copiedList.map(item => pathKey(item.sourcePath || item.path || '')).filter(Boolean))
              setData(current => current && Array.isArray(current.files)
                ? {
                    ...current,
                    files: current.files.map(item => (archivedKeys.has(pathKey(item.path)) ? { ...item, archived: true } : item)),
                  }
                : current)
              dataCache.current.clear()
              setRefreshKey(value => value + 1)
            }
            notify(failed > 0
              ? t('toast.archivedPartial', { count: copied, failed, dir: result.archiveDir || '' })
              : t('toast.archived', { count: copied, dir: result.archiveDir || '' }))
          } catch (caught) {
            notify(t('toast.failed', { message: caught instanceof Error ? caught.message : String(caught) }))
          } finally {
            setArchiving(false)
          }
        }, [inventoryCwd, notify, t])

        const toggleSelected = useCallback((key, checked) => {
          setSelected(previous => {
            const next = new Set(previous)
            if (checked) next.add(key)
            else next.delete(key)
            return next
          })
        }, [])

        const selectAll = useCallback(() => {
          setSelected(new Set(visibleFiles.map(file => fileRowKey(file))))
        }, [visibleFiles])

        const clearSelection = useCallback(() => setSelected(new Set()), [])

        const refresh = useCallback(() => {
          dataCache.current.clear()
          setRefreshKey(value => value + 1)
          void loadPins()
        }, [loadPins])

        /* ─────────────────────────── drawing ─────────────────────────── */

        const platform = health && typeof health.platform === 'string'
          ? health.platform
          : (typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent) ? 'win32' : 'other')
        const canNative = desktop === true

        const scopes = [
          ['session', 'tab.session'],
          ['sent', 'tab.sent'],
          ['pins', 'tab.pinned'],
          ['project', 'tab.project'],
        ]

        const categories = ['all', ...CATEGORY_ORDER.filter(key => (categoryCounts.counts[key] || 0) > 0 || key === category)]

        const sources = SOURCE_ORDER.filter(key => key === 'all' || (sourceCounts.counts[key] || 0) > 0 || key === sourceFilter)

        function resetTransientFilters() {
          setScopeMenuOpen(false)
          setContextMenu(null)
          setQuery('')
          setCategory('all')
          setSourceFilter('all')
          setArchivedOnly(false)
          setFilterMenu(null)
          setSelected(new Set())
        }

        function switchTabScope(nextScope) {
          scopeTouched.current = true
          setScope(nextScope)
          resetTransientFilters()
        }

        function selectRegionTarget(nextTarget, nextTab) {
          scopeTouched.current = true
          if (nextTab !== undefined) setScope(nextTab)
          setRegionTarget(nextTarget)
          resetTransientFilters()
        }

        function renderScopeBar() {
          const sentMatchesCurCount = sentScopeStats.curSessionCount
          const pinMatchesCurCount = pinScopeStats.curSessionCount
          const hasCurWorkspace = Boolean(cwd)
          const effectiveProjCwd = regionTarget.kind === 'history-project'
            ? regionTarget.cwd
            : regionTarget.kind === 'history-session'
              ? (regionTarget.cwd || inventoryCwd || cwd)
              : cwd
          const effectiveProjName = effectiveProjCwd
            ? baseName(effectiveProjCwd)
            : (regionTarget.kind === 'history-project' && regionTarget.name ? regionTarget.name : t('scope.noWorkspaceShort'))

          const activeSessionCacheKey = `${inventorySessionId || 'default'}:session`
          const activeProjectCacheKey = `${inventorySessionId || sessionId || 'default'}:project`

          let currentBadgeCount = 0
          if (scope === 'sent') {
            currentBadgeCount = baseFiles.length
          } else if (scope === 'pins') {
            currentBadgeCount = baseFiles.length
          } else if (scope === 'project') {
            currentBadgeCount = tabCounts[activeProjectCacheKey] ?? baseFiles.length
          } else {
            currentBadgeCount = tabCounts[activeSessionCacheKey] ?? (categoryCounts.total || baseFiles.length)
          }

          let kindLabel = t('scope.convKind')
          let triggerName = `${sessionTitle} (${t('scope.current')})`
          let isHistoryBadge = regionTarget.kind === 'history-session' || regionTarget.kind === 'history-project'

          if (scope === 'project') {
            kindLabel = regionTarget.kind === 'history-project' ? t('scope.historyProjKind') : t('context.project')
            triggerName = effectiveProjCwd
              ? `${effectiveProjName}${regionTarget.kind === 'history-project' ? '' : ` (${t('scope.current')})`}`
              : t('scope.noWorkspaceShort')
            isHistoryBadge = regionTarget.kind === 'history-project' || (regionTarget.kind === 'history-session' && Boolean(regionTarget.cwd && cwd && pathKey(regionTarget.cwd) !== pathKey(cwd)))
          } else if (regionTarget.kind === 'all') {
            kindLabel = scope === 'sent' ? t('scope.sentAllKind') : scope === 'pins' ? t('scope.pins') : t('scope.allKind')
            triggerName = scope === 'sent'
              ? t('scope.sentTitle')
              : scope === 'pins'
                ? t('scope.pinsTitle')
                : t('scope.allRegions')
            isHistoryBadge = false
          } else if (regionTarget.kind === 'current-project') {
            kindLabel = t('context.project')
            triggerName = cwd ? `${baseName(cwd)} (${t('scope.current')})` : t('scope.project')
          } else if (regionTarget.kind === 'history-project') {
            kindLabel = t('scope.historyProjKind')
            triggerName = regionTarget.name || (regionTarget.cwd ? baseName(regionTarget.cwd) : t('group.unknown'))
          } else if (regionTarget.kind === 'history-session') {
            kindLabel = t('scope.historyKind')
            triggerName = inventoryTitle
          } else {
            kindLabel = scope === 'sent'
              ? t('scope.convKind')
              : scope === 'pins'
                ? t('scope.pins')
                : t('scope.convKind')
            triggerName = `${sessionTitle} (${t('scope.current')})`
          }

          const renderOptBtn = ({ key, active, icon, titleText, isCurTag, rightText, hintText, onClick }) => h('button', {
            key,
            type: 'button',
            className: `dfl-scope-opt${active ? ' is-active' : ''}`,
            title: hintText || titleText,
            onClick,
          },
          h('span', { className: 'dfl-scope-opt-left' },
            h('span', { className: 'dfl-scope-opt-icon' }, icon),
            h('span', { className: 'dfl-scope-opt-title' }, titleText),
            isCurTag ? h('span', { className: 'dfl-scope-opt-cur' }, t('scope.current')) : null),
          h('span', { className: 'dfl-scope-opt-right' },
            rightText !== undefined && rightText !== null ? h('span', null, rightText) : null,
            active ? CheckIcon(11) : null))

          let dropdownBody = null
          if (scope === 'sent' || scope === 'pins') {
            const stats = scope === 'sent' ? sentScopeStats : pinScopeStats
            const sectionTitleKey = scope === 'sent' ? 'scope.sentGroupTitle' : 'scope.pinsGroupTitle'
            const treeTitleKey = scope === 'sent' ? 'scope.sentTreeTitle' : 'scope.pinsTreeTitle'
            const allLabelKey = scope === 'sent' ? 'scope.sentAllOption' : 'scope.pinsAllOption'
            dropdownBody = h(React.Fragment, null,
              h('div', { className: 'dfl-scope-group-title' }, t(sectionTitleKey)),
              renderOptBtn({
                key: 'cur-sess',
                active: regionTarget.kind === 'current-session',
                icon: ChatIcon(12),
                titleText: sessionTitle || t('scope.session'),
                isCurTag: true,
                rightText: stats.curSessionCount,
                onClick: () => selectRegionTarget({ kind: 'current-session' }),
              }),
              hasCurWorkspace ? renderOptBtn({
                key: 'cur-proj',
                active: regionTarget.kind === 'current-project',
                icon: FolderIcon(12),
                titleText: `${baseName(cwd)} · ${t('scope.project')}`,
                isCurTag: true,
                rightText: stats.curProjectCount,
                hintText: cwd,
                onClick: () => selectRegionTarget({ kind: 'current-project' }),
              }) : null,
              renderOptBtn({
                key: 'all-regions',
                active: regionTarget.kind === 'all',
                icon: GlobeIcon(12),
                titleText: t(allLabelKey),
                rightText: stats.total,
                onClick: () => selectRegionTarget({ kind: 'all' }),
              }),
              h('div', { className: 'dfl-scope-divider' }),
              h('div', { className: 'dfl-scope-group-title' }, `${t(treeTitleKey)} (${stats.projects.length})`),
              stats.projects.length === 0
                ? h('div', { className: 'dfl-scope-empty-hint' }, t(scope === 'sent' ? 'empty.sent' : 'empty.pins'))
                : stats.projects.map(proj => {
                  const isProjAct = regionTarget.kind === 'history-project'
                    && ((proj.cwd && regionTarget.cwd && pathKey(proj.cwd) === pathKey(regionTarget.cwd))
                    || (!proj.cwd && regionTarget.name === proj.name))
                  return h(React.Fragment, { key: proj.key },
                    h('button', {
                      type: 'button',
                      className: `dfl-scope-opt dfl-scope-proj-opt${isProjAct ? ' is-active' : ''}`,
                      title: proj.cwd ? `${proj.name}\n${proj.cwd}` : proj.name,
                      onClick: () => selectRegionTarget({
                        kind: 'history-project',
                        cwd: proj.cwd,
                        name: proj.name,
                        repSessionId: proj.repSessionId,
                      }),
                    },
                    h('span', { className: 'dfl-scope-opt-left' },
                      h('span', { className: 'dfl-scope-opt-icon' }, FolderIcon(12)),
                      h('span', { className: 'dfl-scope-opt-title' }, proj.name),
                      proj.isCurrent ? h('span', { className: 'dfl-scope-opt-cur' }, t('scope.current')) : null),
                    h('span', { className: 'dfl-scope-opt-right' },
                      h('span', null, proj.count),
                      isProjAct ? CheckIcon(11) : null)),
                    proj.sessions.map(sess => {
                      if (sess.id === '__none__') return null
                      const isSessAct = (regionTarget.kind === 'history-session' && regionTarget.sessionId === sess.id)
                        || (regionTarget.kind === 'current-session' && sess.id === sessionId)
                      return h('button', {
                        key: `${proj.key}:${sess.id}`,
                        type: 'button',
                        className: `dfl-scope-opt dfl-scope-nested-opt${isSessAct ? ' is-active' : ''}`,
                        title: sess.title,
                        onClick: () => selectRegionTarget(
                          sess.id === sessionId
                            ? { kind: 'current-session' }
                            : { kind: 'history-session', sessionId: sess.id, cwd: sess.cwd || proj.cwd, title: sess.title },
                        ),
                      },
                      h('span', { className: 'dfl-scope-opt-left' },
                        h('span', { className: 'dfl-scope-opt-icon' }, ChatIcon(11)),
                        h('span', { className: 'dfl-scope-opt-title' }, sess.title),
                        sess.isCurrent ? h('span', { className: 'dfl-scope-opt-cur' }, t('scope.current')) : null),
                      h('span', { className: 'dfl-scope-opt-right' },
                        h('span', null, sess.count),
                        isSessAct ? CheckIcon(11) : null))
                    }))
                }))
          } else if (scope === 'project') {
            dropdownBody = h(React.Fragment, null,
              h('div', { className: 'dfl-scope-group-title' }, t('scope.projectGroupTitle')),
              projectDirectories.length === 0
                ? h('div', { className: 'dfl-scope-empty-hint' }, t('empty.project'))
                : projectDirectories.map(proj => {
                  const isAct = effectiveProjCwd && pathKey(proj.cwd) === pathKey(effectiveProjCwd)
                  return renderOptBtn({
                    key: proj.key,
                    active: isAct,
                    icon: FolderIcon(12),
                    titleText: proj.name,
                    isCurTag: proj.isCurrent,
                    rightText: t('scope.sessionCount', { count: proj.sessionCount }),
                    hintText: proj.cwd,
                    onClick: () => selectRegionTarget(
                      proj.isCurrent
                        ? { kind: 'current-project' }
                        : { kind: 'history-project', cwd: proj.cwd, name: proj.name, repSessionId: proj.repSessionId },
                    ),
                  })
                }))
          } else {
            dropdownBody = h(React.Fragment, null,
              h('div', { className: 'dfl-scope-group-title' }, t('scope.currentSessionGroup')),
              renderOptBtn({
                key: 'cur-sess',
                active: regionTarget.kind === 'current-session',
                icon: ChatIcon(12),
                titleText: sessionTitle || t('scope.session'),
                isCurTag: true,
                rightText: tabCounts[`${sessionId}:session`],
                onClick: () => selectRegionTarget({ kind: 'current-session' }),
              }),
              hasCurWorkspace ? renderOptBtn({
                key: 'cur-proj-switch',
                active: false,
                icon: FolderIcon(12),
                titleText: `${baseName(cwd)} · ${t('tab.project')}`,
                rightText: tabCounts[`${sessionId}:project`],
                hintText: cwd,
                onClick: () => selectRegionTarget({ kind: 'current-project' }, 'project'),
              }) : null,
              h('div', { className: 'dfl-scope-divider' }),
              h('div', { className: 'dfl-scope-group-title' }, `${t('scope.history')} (${historyOptions.length})`),
              historyOptions.length === 0
                ? h('div', { className: 'dfl-scope-empty-hint' }, t('empty.history'))
                : historyGroups.map(group => h(React.Fragment, { key: group.key || '__none__' },
                  h('div', { className: 'dfl-scope-sub-group', title: group.cwd || '' }, `📁 ${group.name}`),
                  group.sessions.map(row => renderOptBtn({
                    key: row.id,
                    active: regionTarget.kind === 'history-session' && regionTarget.sessionId === row.id,
                    icon: ChatIcon(11),
                    titleText: row.displayTitle,
                    hintText: row.cwd ? `${row.displayTitle}\n${row.cwd}` : row.displayTitle,
                    rightText: row.updatedAt ? formatTime(row.updatedAt) : undefined,
                    onClick: () => selectRegionTarget({
                      kind: 'history-session',
                      sessionId: row.id,
                      cwd: row.cwd,
                      title: row.displayTitle,
                    }),
                  })))))
          }

          const scopeDropdown = !scopeMenuOpen ? null : ReactDOM.createPortal(
            h('div', {
              className: 'dfl-scope-dropdown dfl-theme',
              ...themeAttributes(preferences, scheme),
              role: 'listbox',
              style: {
                left: `${scopePos.left}px`,
                top: `${scopePos.top}px`,
                width: `${scopePos.width}px`,
                maxHeight: `${scopePos.maxHeight || 380}px`,
              },
            }, dropdownBody),
            document.body,
          )

          const isDefaultLocal = regionTarget.kind === 'current-session'
            || (scope === 'project' && regionTarget.kind === 'current-project')

          return h('div', { className: 'dfl-scope-bar', title: t('scope.isolationHint') },
            h('span', { className: 'dfl-scope-bar-label' }, t('context.isolation')),
            h('div', { className: 'dfl-scope-select-wrap' },
              h('button', {
                ref: scopeBtnRef,
                type: 'button',
                className: `dfl-scope-trigger${scopeMenuOpen ? ' is-open' : ''}`,
                'aria-expanded': scopeMenuOpen,
                onClick: () => setScopeMenuOpen(open => !open),
              },
              h('span', { className: 'dfl-scope-trigger-left' },
                h('span', { className: `dfl-scope-kind-badge${isHistoryBadge ? ' is-history' : ''}` }, kindLabel),
                h('span', { className: 'dfl-scope-trigger-name' }, triggerName)),
              h('span', { className: 'dfl-scope-trigger-right' },
                h('span', null, currentBadgeCount),
                CaretDownIcon(11))),
              scopeDropdown),
            !isDefaultLocal
              ? h('button', {
                type: 'button',
                className: 'dfl-scope-back-btn',
                title: t('action.backCurrentHint'),
                onClick: () => selectRegionTarget({ kind: scope === 'project' ? 'current-project' : 'current-session' }),
              }, t('action.backCurrent'))
              : h('span', { className: 'dfl-scope-proj-stat', title: inventoryCwd || '' },
                scope === 'sent'
                  ? t('scope.projStat', { count: sentScopeStats.projects.length })
                  : scope === 'project'
                    ? t('scope.projStat', { count: projectDirectories.length })
                    : t('scope.sessionCount', { count: historyOptions.length + 1 })))
        }

        function renderHeader() {
          const sortOrder = ['time', 'timeAsc', 'name', 'type']
          const sortLabelKey = sort === 'timeAsc' ? 'sort.timeAsc'
            : sort === 'name' ? 'sort.name'
              : sort === 'type' ? 'sort.type'
                : 'sort.time'
          const groupLabelKey = groupMode === 'project'
            ? 'group.byProject'
            : groupMode === 'flat'
              ? 'group.flat'
              : 'group.byCategory'
          const cycleSort = () => {
            setSort(value => sortOrder[(sortOrder.indexOf(value) + 1) % sortOrder.length])
          }
          const cycleGroup = () => {
            setGroupModeForActiveTab(value => (value === 'category' ? 'project' : value === 'project' ? 'flat' : 'category'))
          }

          const countForTab = (tabName) => {
            if (tabName === 'pins') {
              return pinRows.filter(row => matchesRegion(row, regionTarget)).length
            }
            if (tabName === 'sent') {
              if (sentData !== null || scope === 'sent') {
                return sentAllRows.filter(row => matchesRegion(row, regionTarget)).length
              }
              return undefined
            }
            if (tabName === scope) return categoryCounts.total
            const cacheKey = `${inventorySessionId || sessionId || 'default'}:${tabName}`
            return tabCounts[cacheKey]
          }

          return h('header', { className: 'dfl-codex-header' },
            h('div', { className: 'dfl-seg-tabs', role: 'tablist', 'aria-label': t('scope.label') },
              scopes.map(([value, labelKey]) => {
                const count = countForTab(value)
                return h('button', {
                  key: value,
                  type: 'button',
                  className: `dfl-seg-tab${scope === value ? ' is-active' : ''}`,
                  role: 'tab',
                  'aria-selected': scope === value,
                  'aria-pressed': scope === value,
                  onClick: () => switchTabScope(value),
                },
                h('span', null, t(labelKey)),
                typeof count === 'number' ? h('span', { className: 'dfl-seg-count' }, count) : null)
              })),
            h('div', { className: 'dfl-header-right' },
              h('button', {
                type: 'button',
                className: `dfl-icon-btn dfl-select-toggle${selectMode ? ' is-active' : ''}`,
                title: selectMode ? t('action.done') : t('action.select'),
                'aria-pressed': selectMode,
                onClick: () => { setSelectMode(value => !value); setSelected(new Set()); setContextMenu(null) },
              }, h('span', null, selectMode ? t('action.done') : t('action.select'))),
              h('button', {
                type: 'button',
                className: 'dfl-icon-btn is-active dfl-sort-btn',
                title: `${t('sort.label')}: ${t(sortLabelKey)}`,
                'aria-label': `${t('sort.label')}: ${t(sortLabelKey)}`,
                onClick: cycleSort,
              }, h('span', null, t(sortLabelKey))),
              h('button', {
                type: 'button',
                className: `dfl-icon-btn dfl-group-toggle${groupMode !== 'flat' ? ' is-active' : ''}`,
                title: t(groupLabelKey),
                onClick: cycleGroup,
              }, h('span', null, t(groupLabelKey))),
              h('button', {
                type: 'button',
                className: `dfl-icon-btn dfl-refresh-btn${loading ? ' is-loading' : ''}`,
                title: t('action.refresh'),
                'aria-label': t('action.refresh'),
                onClick: refresh,
              }, RefreshIcon(13))))
        }

        function renderRegionPills() {
          if (scope !== 'sent' && scope !== 'pins') return null
          const stats = scope === 'sent' ? sentScopeStats : pinScopeStats
          const pill = (kind, label, count) => h('button', {
            key: kind,
            type: 'button',
            className: `dfl-region-pill${regionTarget.kind === kind ? ' is-active' : ''}`,
            onClick: () => selectRegionTarget({ kind }),
          }, h('span', null, label), h('span', { className: 'dfl-region-num' }, count))

          return h('div', { className: 'dfl-region-strip' },
            h('span', { className: 'dfl-region-label' }, t('scope.regionStripLabel')),
            pill('current-session', t('scope.session'), stats.curSessionCount),
            cwd ? pill('current-project', t('scope.project'), stats.curProjectCount) : null,
            pill('all', t('context.allProjects'), stats.total),
            (regionTarget.kind === 'history-session' || regionTarget.kind === 'history-project')
              ? h('span', { className: 'dfl-region-custom' },
                regionTarget.kind === 'history-project'
                  ? `📁 ${regionTarget.name}`
                  : `💬 ${inventoryTitle}`)
              : null)
        }

        function renderCategoryTabs() {
          if (baseFiles.length === 0) return null
          const allLabelKey = archivedOnly
            ? 'filter.allArchived'
            : scope === 'sent'
              ? 'filter.allSent'
              : scope === 'pins'
                ? 'filter.allPinned'
                : 'filter.recommended'
          return h('div', { className: 'dfl-cat-bar', role: 'tablist', 'aria-label': t('filter.allFiles') },
            categories.map(key => h('button', {
              key,
              type: 'button',
              role: 'tab',
              className: `dfl-cat-pill${category === key ? ' is-active' : ''}`,
              'aria-selected': category === key,
              onClick: () => {
                setCategory(key)
                setFilterMenu(null)
              },
            },
            h('span', null, key === 'all' ? t(allLabelKey) : t(CATEGORY_LABELS[key])),
            h('span', { className: 'dfl-cat-num' }, key === 'all' ? categoryCounts.total : categoryCounts.counts[key] || 0))))
        }

        function renderToolbar() {
          const activeFilterCount = (category !== 'all' ? 1 : 0) + (sourceFilter !== 'all' ? 1 : 0)
          const hasAnyFilter = activeFilterCount > 0 || archivedOnly || query.trim().length > 0

          const filterOption = (kind, key, label, count, isOn) => h('button', {
            key: `${kind}:${key}`,
            type: 'button',
            className: `dfl-filter-option${isOn ? ' is-on' : ''}`,
            role: 'menuitemradio',
            'aria-checked': isOn,
            onClick: () => {
              if (kind === 'source') {
                if (key !== sourceFilter) setCategory('all')
                setSourceFilter(key)
              } else {
                setCategory(key)
                setFilterMenu(null)
              }
            },
          },
          h('span', { className: 'dfl-filter-option-label' }, label),
          h('span', { className: 'dfl-filter-option-count' }, count),
          isOn ? h('span', { className: 'dfl-filter-check', 'aria-hidden': true }, CheckIcon(11)) : null)

          const activeTag = (key, label, clear) => h('span', { key, className: 'dfl-filter-chip' },
            h('span', null, label),
            h('button', {
              type: 'button',
              'aria-label': t('filter.clear'),
              title: t('filter.clear'),
              onClick: clear,
            }, '×'))

          const filterPanel = () => filterMenu !== 'panel' ? null : ReactDOM.createPortal(
            h('div', {
              className: 'dfl-filter-popover dfl-filter-panel dfl-theme',
              ...themeAttributes(preferences, scheme),
              role: 'menu',
              style: {
                left: `${filterPos.left}px`,
                top: `${filterPos.top}px`,
                width: `${filterPos.width}px`,
                maxHeight: `${filterPos.maxHeight || 340}px`,
              },
            },
            h('div', { className: 'dfl-filter-panel-head' },
              h('span', { className: 'dfl-filter-panel-title' }, t('filter.title')),
              hasAnyFilter ? h('button', {
                type: 'button',
                className: 'dfl-filter-clear',
                onClick: () => { setCategory('all'); setSourceFilter('all'); setArchivedOnly(false); setQuery('') },
              }, t('filter.clearAll')) : null),
            h('div', { className: 'dfl-filter-columns' },
              h('div', { className: 'dfl-filter-column' },
                h('div', { className: 'dfl-filter-section-title' }, t('filter.sourceSection')),
                sources.map(key => filterOption('source', key, key === 'all' ? t('filter.sourceAll') : t(SOURCE_LABELS[key]), key === 'all' ? sourceCounts.total : sourceCounts.counts[key] || 0, sourceFilter === key))),
              h('div', { className: 'dfl-filter-column is-child' },
                h('div', { className: 'dfl-filter-section-title dfl-filter-child-title' },
                  h('span', null, t('filter.typeSection')),
                  h('span', { className: 'dfl-filter-parent' }, sourceFilter === 'all' ? t('filter.withinAllSources') : t('filter.within', { value: t(SOURCE_LABELS[sourceFilter]) }))),
                categories.map(key => filterOption('category', key, key === 'all' ? t('filter.typeAll') : t(CATEGORY_LABELS[key]), key === 'all' ? categoryCounts.total : categoryCounts.counts[key] || 0, category === key))))),
            document.body,
          )

          return h(React.Fragment, null,
            h('div', { className: 'dfl-toolbar-row' },
              h('div', { className: 'dfl-search-box' },
                SearchIcon(13),
                h('input', {
                  className: 'dfl-search',
                  type: 'search',
                  value: query,
                  placeholder: t('search.placeholder'),
                  'aria-label': t('search.placeholder'),
                  onChange: event => setQuery(event.target.value),
                }),
                query.length > 0 ? h('button', {
                  type: 'button',
                  className: 'dfl-search-clear',
                  'aria-label': t('filter.clear'),
                  title: t('filter.clear'),
                  onClick: () => setQuery(''),
                }, CloseIcon(10)) : null),
              h('button', {
                ref: filterBtnRef,
                type: 'button',
                className: `dfl-toolbar-pill-btn dfl-filter-trigger${activeFilterCount > 0 ? ' is-active' : ''}${filterMenu === 'panel' ? ' is-open' : ''}`,
                'aria-expanded': filterMenu === 'panel',
                'aria-haspopup': 'menu',
                onClick: () => setFilterMenu(filterMenu === 'panel' ? null : 'panel'),
              },
              h('span', null, t('filter.button')),
              activeFilterCount > 0 ? h('span', { className: 'dfl-toolbar-pill-badge' }, activeFilterCount) : null,
              CaretDownIcon(10)),
              h('button', {
                type: 'button',
                className: `dfl-toolbar-pill-btn dfl-archived-toggle${archivedOnly ? ' is-active' : ''}`,
                'aria-pressed': archivedOnly,
                title: t('filter.archivedHint'),
                onClick: () => setArchivedOnly(value => !value),
              },
              ArchiveIcon(12),
              h('span', null, t('filter.archived')),
              h('span', { className: 'dfl-toolbar-pill-badge' }, archivedCount)),
              filterPanel()),
            hasAnyFilter ? h('div', { className: 'dfl-active-filters' },
              sourceFilter !== 'all' ? activeTag('source', `${t('filter.sourceKey')}: ${t(SOURCE_LABELS[sourceFilter])}`, () => setSourceFilter('all')) : null,
              category !== 'all' ? activeTag('type', `${t('filter.typeLabel')}: ${t(CATEGORY_LABELS[category])}`, () => setCategory('all')) : null,
              archivedOnly ? activeTag('archived', t('filter.archived'), () => setArchivedOnly(false)) : null,
              query.trim().length > 0 ? activeTag('search', `"${query.trim()}"`, () => setQuery('')) : null,
              h('button', {
                type: 'button',
                className: 'dfl-filter-clear-btn',
                onClick: () => { setCategory('all'); setSourceFilter('all'); setArchivedOnly(false); setQuery('') },
              }, t('filter.clearAll'))) : null)
        }

        function renderSelectionBar() {
          if (!selectMode) return null
          const count = selectedFiles.length
          return h('div', { className: 'dfl-composite-bar' },
            h('div', { className: 'dfl-comp-left' },
              h('button', { type: 'button', className: 'dfl-comp-btn', onClick: selectAll }, t('select.all')),
              count > 0 ? h('button', { type: 'button', className: 'dfl-comp-btn', onClick: clearSelection }, t('select.clear')) : null,
              h('span', { className: 'dfl-comp-count' }, t('select.count', { count }))),
            h('div', { className: 'dfl-comp-actions' },
              h('button', {
                type: 'button', className: 'dfl-comp-btn', disabled: count === 0,
                onClick: () => addPins(selectedFiles),
              }, `★ ${t('action.pin')}`),
              h('button', {
                type: 'button', className: 'dfl-comp-btn', disabled: count === 0 || archiving,
                onClick: () => archiveFiles(selectedFiles),
              }, `📦 ${archiving ? t('toast.archiving') : t('action.archive')}`),
              h('button', {
                type: 'button', className: 'dfl-comp-btn', disabled: count === 0,
                title: t('action.attachFilesHint'),
                onClick: () => attachToComposer(selectedFiles),
              }, `📎 ${t('action.attachFiles')}`),
              h('button', {
                type: 'button', className: 'dfl-comp-btn', disabled: count === 0,
                onClick: () => copyReference(selectedFiles),
              }, t('action.copyRef')),
              h('button', {
                type: 'button', className: 'dfl-comp-btn is-primary', disabled: count === 0,
                onClick: () => insertReferences(selectedFiles, { absolute: true }),
              }, t('action.addToInput'))))
        }

        function openContextMenu(file, event) {
          event.preventDefault()
          event.stopPropagation()
          const rect = event.currentTarget && typeof event.currentTarget.getBoundingClientRect === 'function'
            ? event.currentTarget.getBoundingClientRect()
            : undefined
          const x = event.type === 'contextmenu' ? event.clientX : (rect ? rect.right : window.innerWidth - 280)
          const y = event.type === 'contextmenu' ? event.clientY : (rect ? rect.bottom + 4 : 120)
          setContextMenu({ file, x, y })
          void loadApps(file)
        }

        async function copyImageFile(file) {
          try {
            const session = file.sessionId || inventorySessionId || sessionId
            const result = await ctx.remote.workspaceFiles.readBytes(session, file.previewPath || file.path, {}, new AbortController().signal)
            if (!result.ok) throw new Error(result.error?.message || t('viewer.failed'))
            const bytes = result.value && result.value.data ? result.value.data : result.value
            const blob = new Blob([bytes], { type: imageMime(file.name) })
            if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
              await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
              notify(t('toast.imageCopied'))
            } else {
              await copyPath(file)
            }
          } catch (error) {
            notify(t('toast.failed', { message: error instanceof Error ? error.message : String(error) }))
          }
        }

        function requestDelete(file) {
          setContextMenu(null)
          setViewer(null)
          setPendingDelete({ file })
        }

        async function confirmDelete() {
          const file = pendingDelete && pendingDelete.file
          if (file === null || file === undefined) return
          try {
            await api('/api/file-launcher.delete', {
              method: 'POST',
              body: JSON.stringify({
                path: file.path,
                confirm: true,
                ...(file.cwd || inventoryCwd ? { cwd: file.cwd || inventoryCwd } : {}),
              }),
            })
            setPendingDelete(null)
            dataCache.current.clear()
            setData(previous => previous === null ? previous : {
              ...previous,
              files: previous.files.filter(item => pathKey(item.path) !== pathKey(file.path)),
            })
            setSelected(previous => {
              const next = new Set(previous)
              next.delete(fileRowKey(file))
              return next
            })
            setPins(previous => previous.filter(pin => pathKey(pin.path) !== pathKey(file.path)))
            notify(t('toast.deleted', { name: file.name }))
            setRefreshKey(value => value + 1)
          } catch (error) {
            notify(t('toast.failed', { message: error instanceof Error ? error.message : String(error) }))
          }
        }

        function renderRow(file) {
          const rowKey = fileRowKey(file)
          const pinned = pinKeys.has(pathKey(file.path))
          const selectedNow = selected.has(rowKey)
          const isMenuOpen = contextMenu !== null && fileRowKey(contextMenu.file) === rowKey
          const previewable = file.missing !== true && canPanelPreview(file)
          const canPinRow = file.isFolder !== true && (file.missing !== true || pinned)
          const context = (scope === 'sent' || scope === 'pins') && groupMode !== 'project'
            ? [file.projectName, file.sessionTitle].filter(Boolean).join(' · ')
            : ''
          const dirPart = file.rel && file.rel !== file.name
            ? file.rel
            : (file.dir || '')
          const meta = [
            context,
            file.source !== 'pinned' ? formatTime(file.mtime) : '',
            typeof file.size === 'number' && file.size > 0 ? formatBytes(file.size) : '',
            dirPart,
          ].filter(Boolean).join(' · ')
          const showSourceBadge = scope === 'session' || scope === 'pins' || file.source === 'delivered' || file.source === 'attachment'
          const openThis = () => {
            if (file.missing === true) { notify(t('toast.missing')); return }
            if (file.isFolder === true) { void openFolder(file); return }
            if (previewable) openViewer(file)
            else preview(file)
          }
          return h('div', { key: rowKey, className: 'dfl-item' },
            h('div', {
              className: `dfl-row${selectedNow ? ' is-selected' : ''}${isMenuOpen ? ' is-open' : ''}${file.missing === true ? ' is-missing' : ''}${file.reference === true ? ' is-reference' : ''}${pinned ? ' is-pinned' : ''}`,
              role: 'button',
              tabIndex: 0,
              title: file.path,
              onClick: () => { if (selectMode) toggleSelected(rowKey, !selectedNow); else openThis() },
              onContextMenu: event => {
                if (selectMode) return
                openContextMenu(file, event)
              },
              onKeyDown: event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  if (selectMode) toggleSelected(rowKey, !selectedNow)
                  else openThis()
                }
              },
            },
            selectMode
              ? h('input', {
                type: 'checkbox',
                className: 'dfl-check',
                checked: selectedNow,
                'aria-label': t('select.row', { name: file.name }),
                onClick: event => event.stopPropagation(),
                onChange: event => toggleSelected(rowKey, event.target.checked),
              })
              : canPinRow
                ? h('button', {
                  type: 'button',
                  className: `dfl-star-btn${pinned ? ' is-pinned' : ''}`,
                  title: pinned ? t('menu.unpin') : t('menu.pin'),
                  'aria-label': pinned ? t('menu.unpin') : t('menu.pin'),
                  'aria-pressed': pinned,
                  onClick: event => {
                    event.stopPropagation()
                    void (pinned ? removePins([file]) : addPins([file]))
                  },
                }, StarIcon(pinned, 13))
                : h('span', { className: 'dfl-star-spacer', 'aria-hidden': true }),
            h('div', { className: 'dfl-icon', 'data-cat': file.category || categoryOf(file) }, file.isFolder === true ? 'DIR' : extensionLabel(file.name)),
            h('div', { className: 'dfl-main' },
              h('div', { className: 'dfl-name-line' },
                h('span', { className: 'dfl-name' }, file.name),
                file.missing === true ? h('span', { className: 'dfl-badge is-missing' }, t('source.missing')) : null,
                file.moved === true ? h('span', { className: 'dfl-badge is-moved' }, t('source.moved')) : null,
                file.reference === true ? h('button', {
                  type: 'button',
                  className: 'dfl-badge is-reference',
                  title: t('reference.trace'),
                  onClick: event => {
                    event.stopPropagation()
                    setTraceFile(file)
                  },
                }, RefLinkIcon(9), h('span', null, t('reference.badge'))) : null,
                showSourceBadge && file.source !== 'pinned' ? h('span', { className: `dfl-badge is-${file.source || 'recent'}` }, t('source.' + (file.source || 'workspace'))) : null,
                file.projectName && (scope === 'sent' || scope === 'pins') && groupMode !== 'project' ? h('span', { className: 'dfl-badge is-proj' }, file.projectName) : null,
                pinned && scope !== 'pins' ? h('span', { className: 'dfl-badge is-pinned' }, t('badge.antiCompaction')) : null,
                file.archived === true ? h('span', { className: 'dfl-badge is-archived' }, t('source.archived')) : null),
              h('div', { className: 'dfl-meta' },
                h('span', { className: 'dfl-meta-text' }, meta || t('source.' + file.source)),
                file.description ? h('span', { className: 'dfl-desc' }, ` · ${file.description}`) : null)),
            h('div', { className: 'dfl-row-actions' },
              file.missing !== true ? h(React.Fragment, null,
                h('button', {
                  type: 'button',
                  className: 'dfl-row-act-btn',
                  title: t('action.insertHint'),
                  onClick: event => { event.stopPropagation(); void insertReferences([file], { absolute: true }) },
                }, t('action.insertShort')),
                h('button', {
                  type: 'button',
                  className: 'dfl-row-act-btn',
                  title: t('action.copyRefHint'),
                  onClick: event => { event.stopPropagation(); void copyReference([file]) },
                }, t('action.copyRef'))) : null,
              h('button', {
                type: 'button',
                className: 'dfl-open-button',
                title: t('action.menu'),
                'aria-label': t('action.menu'),
                'aria-expanded': isMenuOpen,
                onClick: event => openContextMenu(file, event),
              }, h('span', null, file.missing === true ? t('action.actions') : t('action.menu')), CaretDownIcon(11)))))
        }

        function renderLoadingComfort(modeKey, elapsedMs, file = null) {
          const safeElapsed = Math.max(0, Number(elapsedMs) || 0)
          const secStr = (safeElapsed / 1000).toFixed(1)
          const baselineMs = Math.max(800, Number(scopeDurationRef.current[modeKey] || 1800))
          const estLow = Math.max(1, Math.round(baselineMs * 0.8 / 1000))
          const estHigh = Math.max(estLow + 1, Math.ceil((baselineMs * 1.35) / 1000))
          const remainSec = Math.max(1, Math.ceil((baselineMs * 1.15 - safeElapsed) / 1000))
          const overBudget = safeElapsed > baselineMs * 1.15
          const stage = safeElapsed >= 6000 ? 'long' : safeElapsed >= 2500 ? 'mid' : 'early'

          let headlineKey = 'loading'
          if (modeKey === 'viewer') {
            if (stage === 'long') headlineKey = 'loading.comfort.long'
            else if (file && isOfficeFile(file)) headlineKey = 'viewer.converting'
            else if (file && isPdfFile(file)) headlineKey = 'viewer.rendering'
            else headlineKey = 'viewer.loading'
          } else if (stage === 'long') {
            headlineKey = 'loading.comfort.long'
          } else if (stage === 'mid') {
            headlineKey = modeKey === 'project'
              ? 'loading.comfort.projectMid'
              : modeKey === 'sent'
                ? 'loading.comfort.sentMid'
                : 'loading.comfort.sessionMid'
          } else {
            headlineKey = modeKey === 'project'
              ? 'loading.comfort.project'
              : modeKey === 'sent'
                ? 'loading.comfort.sent'
                : 'loading.comfort.session'
          }

          const etaLine = overBudget
            ? t('loading.etaFinishing', { elapsed: secStr })
            : t('loading.eta', { elapsed: secStr, low: estLow, high: estHigh, remain: remainSec })
          const pct = overBudget
            ? Math.min(94, 78 + Math.round((safeElapsed - baselineMs * 1.15) / 800))
            : Math.min(82, Math.max(12, Math.round((safeElapsed / Math.max(baselineMs, 900)) * 78)))

          return h('div', {
            className: modeKey === 'viewer' ? 'dfl-viewer-status dfl-loading-card' : 'dfl-empty dfl-loading-card',
            role: 'status',
          },
          h('div', { className: 'dfl-loading-head' },
            h('span', { className: 'dfl-spinner', 'aria-hidden': true }),
            h('span', { className: 'dfl-loading-title' }, t(headlineKey))),
          h('div', { className: 'dfl-loading-track', 'aria-hidden': true },
            h('div', { className: 'dfl-loading-fill', style: { width: `${pct}%` } })),
          h('p', { className: 'dfl-loading-eta' }, etaLine),
          h('p', { className: 'dfl-empty-text' }, t(modeKey === 'viewer' ? 'viewer.comfort.hint' : 'loading.comfort.hint')),
          modeKey === 'viewer' && file ? h('div', { className: 'dfl-empty-actions' },
            canNative ? h('button', {
              type: 'button',
              className: 'dfl-button is-primary',
              onClick: () => { void openNative(file) },
            }, t('viewer.quickOpenNative')) : null,
            canNative ? h('button', {
              type: 'button',
              className: 'dfl-button',
              onClick: () => { void reveal(file) },
            }, t('viewer.quickReveal')) : null) : null)
        }

        function renderFileList() {
          if (loading && baseFiles.length === 0) {
            return renderLoadingComfort(inventoryScope, loadElapsedMs)
          }
          if (error) {
            return h('div', { className: 'dfl-empty' },
              h('p', { className: 'dfl-empty-title' }, t('error.title')),
              h('p', { className: 'dfl-empty-text' }, error),
              h('button', { type: 'button', className: 'dfl-button', onClick: refresh }, t('error.retry')))
          }
          if (visibleFiles.length === 0) {
            const hasActiveFilter = query.trim().length > 0 || category !== 'all' || sourceFilter !== 'all' || archivedOnly
            const key = hasActiveFilter
              ? 'empty.filtered'
              : scope === 'pins' ? 'empty.pins' : scope === 'sent' ? 'empty.sent' : scope === 'project' ? 'empty.project' : 'empty.session'
            const stats = scope === 'sent' ? sentScopeStats : scope === 'pins' ? pinScopeStats : null
            const canOfferQuickExpand = !hasActiveFilter && stats !== null && regionTarget.kind !== 'all' && stats.total > 0
            return h('div', { className: 'dfl-empty' },
              h('p', { className: 'dfl-empty-title' }, t('empty.title')),
              h('p', { className: 'dfl-empty-text' }, t(key)),
              canOfferQuickExpand ? h('div', { className: 'dfl-empty-actions' },
                cwd && regionTarget.kind === 'current-session' && stats.curProjectCount > 0 ? h('button', {
                  type: 'button',
                  className: 'dfl-button',
                  onClick: () => selectRegionTarget({ kind: 'current-project' }),
                }, t('scope.showProject', { count: stats.curProjectCount })) : null,
                h('button', {
                  type: 'button',
                  className: 'dfl-button is-primary',
                  onClick: () => selectRegionTarget({ kind: 'all' }),
                }, t('scope.showAll', { count: stats.total }))) : null)
          }
          const forceOpenGroups = query.trim().length > 0 || category !== 'all' || sourceFilter !== 'all' || archivedOnly
          if (categoryGroups !== null) {
            return h('div', { className: 'dfl-list dfl-grouped-list' }, categoryGroups.map(group => {
              const key = group.key
              const open = forceOpenGroups || !collapsedCategories.has(key)
              return h('div', { key, className: `dfl-category-group${open ? ' is-open' : ''}` },
                h('button', {
                  type: 'button',
                  className: 'dfl-category-group-head',
                  'aria-expanded': open,
                  onClick: () => setCollapsedCategories(previous => {
                    const next = new Set(previous)
                    if (next.has(key)) next.delete(key)
                    else next.add(key)
                    return next
                  }),
                },
                CaretDownIcon(11),
                h('span', { className: 'dfl-group-name' }, t(CATEGORY_LABELS[key] || 'filter.other')),
                h('span', { className: 'dfl-group-count' }, `(${group.files.length})`)),
                open ? h('div', { className: 'dfl-group-rows' }, group.files.map(renderRow)) : null)
            }))
          }
          if (fileGroups !== null) {
            const hasAnyCurProj = fileGroups.some(item => item.isCurrent === true)
            const renderSessionGroup = (projectKey, session, singleSession, sIdx, hasCurSess) => {
              const sessionKey = `${projectKey}:session:${session.key}`
              const sessionOpen = expandedSessions.get(sessionKey) ?? (
                forceOpenGroups
                || preferences?.collapseGroups === false
                || session.isCurrent === true
                || singleSession
                || (!hasCurSess && sIdx === 0)
              )
              return h('div', { key: sessionKey, className: `dfl-file-session${sessionOpen ? ' is-open' : ''}` },
                h('button', {
                  type: 'button',
                  className: 'dfl-group-session-head',
                  'aria-expanded': sessionOpen,
                  onClick: () => setExpandedSessions(previous => {
                    const next = new Map(previous)
                    next.set(sessionKey, !sessionOpen)
                    return next
                  }),
                },
                ChevronRightIcon(11, `dfl-group-caret${sessionOpen ? ' is-open' : ''}`),
                session.key === 'workspace' ? FolderIcon(12) : ChatIcon(12),
                h('span', { className: 'dfl-group-session-name' }, session.name),
                session.isCurrent === true ? h('span', { className: 'dfl-group-badge' }, t('scope.current')) : null,
                h('span', { className: 'dfl-group-count' }, `${session.files.length}`)),
                sessionOpen ? h('div', { className: 'dfl-group-rows' }, session.files.map(renderRow)) : null)
            }
            return h('div', { className: 'dfl-list dfl-grouped-list' }, fileGroups.map((project, idx) => {
              const projectKey = `files:project:${project.key}`
              const projectOpen = expandedProjects.get(projectKey) ?? (
                forceOpenGroups
                || preferences?.collapseGroups === false
                || project.isCurrent === true
                || fileGroups.length === 1
                || (!hasAnyCurProj && idx === 0)
              )
              const singleSession = project.sessions.length === 1
              const hasCurSess = project.sessions.some(item => item.isCurrent === true)
              return h('div', { key: projectKey, className: `dfl-file-group${projectOpen ? ' is-open' : ''}` },
                h('button', {
                  type: 'button',
                  className: 'dfl-group-project-head',
                  'aria-expanded': projectOpen,
                  onClick: () => setExpandedProjects(previous => {
                    const next = new Map(previous)
                    next.set(projectKey, !projectOpen)
                    return next
                  }),
                },
                ChevronRightIcon(12, `dfl-group-caret${projectOpen ? ' is-open' : ''}`),
                FolderIcon(13),
                h('span', { className: 'dfl-group-name' }, project.name),
                project.isCurrent === true ? h('span', { className: 'dfl-group-badge' }, t('scope.current')) : null,
                h('span', { className: 'dfl-group-path', title: project.path }, project.path),
                h('span', { className: 'dfl-group-count' }, `${project.files}`)),
                projectOpen ? h('div', { className: 'dfl-group-sessions' }, project.sessions.map((session, sIdx) => renderSessionGroup(projectKey, session, singleSession, sIdx, hasCurSess))) : null)
            }))
          }
          return h('div', { className: 'dfl-list' }, visibleFiles.map(renderRow))
        }

        function renderFooter() {
          const total = baseFiles.length
          const truncated = currentData && currentData.truncated && scope !== 'pins' && scope !== 'sent'
          const footPathText = regionTarget.kind === 'all' && (scope === 'sent' || scope === 'pins')
            ? t('scope.allRegions')
            : (inventoryCwd || t('foot.noWorkspace'))
          return h('div', { className: 'dfl-foot' },
            h('span', { className: 'dfl-foot-count' },
              t('foot.count', { count: visibleFiles.length, total }) + (truncated ? t('foot.truncated') : '')),
            h('span', { className: 'dfl-foot-path', title: footPathText }, footPathText))
        }

        function renderOfficeHelp(file) {
          if (!isOfficeFile(file)) return null
          const hostState = health === null
            ? t('host.checking')
            : health.officeKit === false ? t('host.officeKitMissing') : t('host.officeKitPresent')
          return h('div', { className: 'dfl-office-help' },
            h('p', { className: 'dfl-office-help-title' }, t('host.title')),
            h('p', { className: 'dfl-office-help-text' }, t('host.officeHelp')),
            h('p', { className: 'dfl-office-help-text' }, hostState),
            h('ol', { className: 'dfl-office-help-steps' },
              h('li', null, t('host.step1')),
              h('li', null, t('host.step2')),
              h('li', null, t('host.step3')),
              h('li', null, t('host.step4'))),
            h('div', { className: 'dfl-office-help-actions' },
              h('button', {
                type: 'button', className: 'dfl-button is-primary',
                onClick: () => void copyText(t('host.commandText')).then(ok => notify(ok ? t('host.copiedCommand') : t('toast.copyFailed'))),
              }, t('host.copyCommand')),
              h('a', {
                className: 'dfl-button',
                href: 'https://github.com/ZOU2850/dsh-file-launcher/blob/main/docs/HOST-REQUIREMENTS.md',
                target: '_blank', rel: 'noreferrer',
              }, t('host.openDocs'))),
            h('p', { className: 'dfl-office-help-hint' }, t('host.commandHint')))
        }

        function renderViewer() {
          if (viewer === null) return null
          const file = viewer.items[viewer.index]
          if (file === undefined) return null
          const count = viewer.items.length
          const current = viewerState.file && viewerState.file.path === file.path ? viewerState : { status: 'loading', file }
          return ReactDOM.createPortal(h('div', {
            className: 'dfl-viewer-modal dfl-theme',
            role: 'presentation',
            ...themeAttributes(preferences, scheme),
          },
          h('div', {
            className: 'dfl-viewer',
            role: 'dialog',
            'aria-modal': true,
            'aria-label': t('viewer.title'),
            onContextMenu: event => {
              event.preventDefault()
              setContextMenu({ file, x: event.clientX, y: event.clientY })
            },
          },
            h('div', { className: 'dfl-viewer-head' },
              h('div', { className: 'dfl-viewer-title', title: file.path },
                h('div', { className: 'dfl-icon', 'data-cat': file.category }, file.isFolder === true ? FolderIcon(12) : extensionLabel(file.name)),
                h('span', { className: 'dfl-viewer-name' }, file.name),
                h('span', { className: 'dfl-viewer-count' }, `${viewer.index + 1} / ${count}`)),
              h('div', { className: 'dfl-viewer-actions' },
                h('button', {
                  type: 'button',
                  className: 'dfl-viewer-link',
                  title: t('action.insertHint'),
                  onClick: () => void insertReferences([file], { absolute: true }),
                }, h('span', null, t('action.insertShort'))),
                h('button', {
                  type: 'button',
                  className: 'dfl-viewer-link',
                  title: t('action.copyRefHint'),
                  onClick: () => void copyReference([file]),
                }, h('span', null, t('action.copyRef'))),
                current.status !== 'pages' ? h('button', {
                  type: 'button',
                  className: 'dfl-viewer-link',
                  onClick: () => preview(file),
                }, ExternalArrowIcon(12), h('span', null, t('viewer.openSidebar'))) : null,
                h('div', { className: 'dfl-viewer-seg' },
                  h('button', {
                    type: 'button', className: 'dfl-viewer-button', disabled: count < 2,
                    title: t('viewer.previous'), 'aria-label': t('viewer.previous'),
                    onClick: () => moveViewer(-1),
                  }, PrevIcon(14)),
                  h('button', {
                    type: 'button', className: 'dfl-viewer-button', disabled: count < 2,
                    title: t('viewer.next'), 'aria-label': t('viewer.next'),
                    onClick: () => moveViewer(1),
                  }, NextIcon(14))),
                h('button', {
                  type: 'button', className: 'dfl-viewer-button is-close', title: t('viewer.close'), 'aria-label': t('viewer.close'),
                  onClick: () => setViewer(null),
                }, CloseIcon(14)))),
            current.status === 'pages' ? h('div', { className: 'dfl-viewer-toolbar' },
              h('div', { className: 'dfl-viewer-seg' },
                h('button', {
                  type: 'button', className: 'dfl-viewer-button', disabled: current.page <= 0,
                  title: t('viewer.previousPage'), 'aria-label': t('viewer.previousPage'),
                  onClick: () => goViewerPage(-1),
                }, PrevIcon(13)),
                h('span', { className: 'dfl-viewer-pagecount' }, `${current.page + 1} / ${current.totalPages}`),
                h('button', {
                  type: 'button', className: 'dfl-viewer-button', disabled: current.page >= current.pages.length - 1,
                  title: t('viewer.nextPage'), 'aria-label': t('viewer.nextPage'),
                  onClick: () => goViewerPage(1),
                }, NextIcon(13))),
              h('div', { className: 'dfl-viewer-seg' },
                h('button', {
                  type: 'button', className: 'dfl-viewer-button', title: t('viewer.zoomOut'), 'aria-label': t('viewer.zoomOut'),
                  onClick: () => zoomViewer(-0.25),
                }, '−'),
                h('button', {
                  type: 'button', className: 'dfl-viewer-fit', title: t('viewer.fitWidth'), 'aria-pressed': current.fit,
                  onClick: toggleViewerFit,
                }, current.fit ? t('viewer.fitWidth') : `${Math.round(current.zoom * 100)}%`),
                h('button', {
                  type: 'button', className: 'dfl-viewer-button', title: t('viewer.zoomIn'), 'aria-label': t('viewer.zoomIn'),
                  onClick: () => zoomViewer(0.25),
                }, '+')),
              h('button', {
                type: 'button', className: 'dfl-viewer-link',
                onClick: () => preview(file),
              }, ExternalArrowIcon(12), h('span', null, t('viewer.openSidebar'))),
              current.truncated ? h('span', { className: 'dfl-viewer-note' }, t('viewer.truncated', { count: current.pages?.length || 0 })) : null) : null,
            h('div', {
              className: `dfl-viewer-body${current.status === 'pages' || current.status === 'image' ? ' is-stage' : ''}`,
            },
              current.status === 'loading'
                ? renderLoadingComfort('viewer', loadElapsedMs, file)
                : current.status === 'error'
                  ? h('div', { className: 'dfl-viewer-status' },
                    h('p', { className: 'dfl-empty-title' }, t('viewer.failed')),
                    h('p', { className: 'dfl-empty-text' }, current.error),
                    renderOfficeHelp(file),
                    isOfficeFile(file)
                      ? (canNative ? h('button', {
                        type: 'button', className: 'dfl-button',
                        onClick: () => void openNative(file),
                      }, t('viewer.openDefault')) : null)
                      : h('button', {
                        type: 'button', className: 'dfl-button',
                        onClick: () => preview(file),
                      }, t('viewer.openSidebar')))
                  : current.status === 'pages'
                    ? h('div', {
                      className: 'dfl-pdf-scroll',
                      ref: viewerScrollRef,
                      onScroll: onViewerPagesScroll,
                    },
                    current.pages.map((page, index) => h('div', {
                      key: page.page,
                      className: 'dfl-pdf-page',
                      ref: element => { viewerPageRefs.current[index] = element },
                      style: { width: current.fit ? '100%' : `${Math.round(current.zoom * 100)}%` },
                    },
                    h('img', { src: page.url, alt: `${file.name} ${index + 1}`, draggable: false }),
                    h('span', { className: 'dfl-pdf-page-number' }, String(index + 1)))))
                    : current.status === 'image'
                      ? h('div', { className: 'dfl-image-stage' },
                        h('img', {
                          className: 'dfl-viewer-image', src: current.url, alt: file.name,
                          onError: () => setViewerState({ status: 'error', error: t('viewer.failed'), file }),
                        }))
                      : current.status === 'text'
                        ? h(React.Fragment, null,
                          current.truncated ? h('div', { key: 'banner', className: 'dfl-viewer-text-banner' }, t('viewer.textTruncated')) : null,
                          h('pre', { key: 'text', className: 'dfl-viewer-text' }, current.text))
                        : null),
            h('div', { className: 'dfl-viewer-foot' },
              h('span', { className: 'dfl-viewer-hint' }, t('viewer.hint')),
              h('span', { className: 'dfl-viewer-path', title: file.path }, file.path)))), document.body)
        }

        function renderContextMenu() {
          if (contextMenu === null) return null
          const file = contextMenu.file
          const isFolder = file.isFolder === true
          const isMissing = file.missing === true
          const pinned = pinKeys.has(pathKey(file.path))
          const previewable = canPanelPreview(file)
          const cached = appCache.current[file.path]
          const width = 268
          const left = Math.max(8, Math.min(contextMenu.x, window.innerWidth - width - 8))
          const estHeight = Math.min(window.innerHeight - 24, 420)
          const top = contextMenu.y + estHeight > window.innerHeight - 8
            ? Math.max(8, Math.min(contextMenu.y - estHeight, window.innerHeight - estHeight - 8))
            : Math.max(8, contextMenu.y)
          const maxHeight = Math.max(160, window.innerHeight - top - 8)
          const action = (run) => (event) => {
            event.preventDefault()
            event.stopPropagation()
            setContextMenu(null)
            void run()
          }
          const item = (key, label, run, danger = false) => h('button', {
            key,
            type: 'button',
            className: `dfl-menu-item${danger ? ' is-danger' : ''}`,
            onClick: action(run),
          }, label)
          const apps = cached && cached.list ? cached.list : []
          const primaryGroup = [
            isFolder && !isMissing
              ? item('openFolder', t('action.folder'), () => openFolder(file))
              : !isMissing && previewable ? item('inline', t('menu.inline'), () => openViewer(file)) : null,
            !isFolder && !isMissing ? item('sidebar', t('menu.preview'), () => preview(file)) : null,
            !isFolder && !isMissing && canNative ? item('reveal', t('menu.reveal'), () => reveal(file)) : null,
            !isFolder && !isMissing && platform === 'win32' ? item('openAs', t('menu.openAs'), () => openAs(file)) : null,
          ].filter(Boolean)
          const actionGroup = [
            item('copyAttach', t('menu.attach'), () => insertReferences([file], { absolute: true })),
            !isFolder && !isMissing ? item('dropAttach', `📎 ${t('action.attachFiles')}`, () => attachToComposer([file])) : null,
            item('copyRef', t('menu.copyRef'), () => copyReference([file])),
            item('copyPath', t('menu.copyPath'), () => copyPath(file)),
            !isFolder && !isMissing && isImageFile(file) ? item('copyImage', t('menu.copyImage'), () => copyImageFile(file)) : null,
            file.reference === true ? item('trace', t('menu.trace'), () => setTraceFile(file)) : null,
            !isFolder && !isMissing ? item('pin', pinned ? t('menu.unpin') : t('menu.pin'), () => pinned ? removePins([file]) : addPins([file])) : null,
            !isFolder && !isMissing ? item('archive', t('menu.archive'), () => archiveFiles([file])) : null,
          ].filter(Boolean)
          const dangerItem = !isFolder && !isMissing ? item('delete', t('menu.delete'), () => requestDelete(file), true) : null
          return ReactDOM.createPortal(h('div', {
            className: 'dfl-context-layer dfl-theme',
            ...themeAttributes(preferences, scheme),
            onMouseDown: event => { if (event.target === event.currentTarget) setContextMenu(null) },
          },
          h('div', {
            className: 'dfl-context-menu',
            style: { left: `${left}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${maxHeight}px` },
            role: 'menu',
            'aria-label': t('action.menu'),
            ref: contextMenuRef,
            onKeyDown: event => {
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
              const items = [...event.currentTarget.querySelectorAll('.dfl-menu-item')]
              if (items.length === 0) return
              event.preventDefault()
              const current = items.indexOf(document.activeElement)
              let next = current
              if (event.key === 'Home') next = 0
              else if (event.key === 'End') next = items.length - 1
              else if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length
              else next = current <= 0 ? items.length - 1 : current - 1
              items[next].focus()
            },
          },
          h('div', { className: 'dfl-context-head' },
            h('div', { className: 'dfl-context-head-row' },
              h('div', { className: 'dfl-icon', 'data-cat': file.category }, file.isFolder === true ? FolderIcon(12) : extensionLabel(file.name)),
              h('div', { className: 'dfl-context-head-meta' },
                h('div', { className: 'dfl-context-name', title: file.path }, file.name),
                h('div', { className: 'dfl-context-path', title: file.path }, file.path))),
            isMissing ? h('div', { className: 'dfl-context-note' }, t('source.missingHint')) : null),
          primaryGroup.length > 0 ? h('div', { className: 'dfl-context-group' }, primaryGroup) : null,
          !isFolder && !isMissing ? h('div', { className: 'dfl-context-group' },
            h('div', { className: 'dfl-context-label' }, t('menu.apps')),
            !cached || cached.loading ? h('div', { className: 'dfl-context-note' }, t('menu.detecting')) : null,
            apps.map(app => h('button', {
              key: app.id,
              type: 'button',
              className: 'dfl-menu-item',
              onClick: action(() => openNative(file, app)),
            }, h('span', { className: 'dfl-app-name' }, app.name || app.id), app.default ? h('span', { className: 'dfl-app-default' }, t('menu.defaultSuffix')) : null)),
            cached && !cached.loading && apps.length === 0
              ? h('div', { className: 'dfl-context-note' }, t(cached.hostOutdated ? 'menu.hostOutdated' : 'menu.noApps'))
              : null) : null,
          actionGroup.length > 0 ? h('div', { className: 'dfl-context-group' }, actionGroup) : null,
          isMissing ? h('div', { className: 'dfl-context-group' },
            item('forget', t('menu.forget'), () => forgetMissing(file))) : null,
          dangerItem !== null ? h('div', { className: 'dfl-context-group dfl-context-danger' }, dangerItem) : null),
          ), document.body)
        }

        function renderDeleteConfirm() {
          if (pendingDelete === null) return null
          const file = pendingDelete.file
          return ReactDOM.createPortal(h('div', {
            className: 'dfl-confirm-modal dfl-theme',
            ...themeAttributes(preferences, scheme),
            onMouseDown: event => { if (event.target === event.currentTarget) setPendingDelete(null) },
          },
          h('div', { className: 'dfl-confirm-card', role: 'dialog', 'aria-modal': true, 'aria-label': t('delete.title') },
            h('div', { className: 'dfl-modal-head' },
              h('div', { className: 'dfl-modal-title-wrap' },
                h('span', { className: 'dfl-modal-danger-icon' }, WarningIcon(15)),
                h('span', { className: 'dfl-confirm-title' }, t('delete.title'))),
              h('button', {
                type: 'button', className: 'dfl-modal-close',
                'aria-label': t('delete.cancel'), onClick: () => setPendingDelete(null),
              }, CloseIcon(13))),
            h('div', { className: 'dfl-modal-body' },
              h('div', { className: 'dfl-confirm-file-pill', title: file.path },
                h('div', { className: 'dfl-icon', 'data-cat': file.category }, file.isFolder === true ? FolderIcon(12) : extensionLabel(file.name)),
                h('div', { className: 'dfl-confirm-file-info' },
                  h('div', { className: 'dfl-confirm-name' }, file.name),
                  h('div', { className: 'dfl-confirm-path' }, file.path))),
              h('p', { className: 'dfl-confirm-text' }, t('delete.message')),
              file.source === 'attachment' ? h('p', { className: 'dfl-confirm-warning' }, t('delete.attachmentWarning')) : null),
            h('div', { className: 'dfl-confirm-actions' },
              h('button', { type: 'button', className: 'dfl-button', onClick: () => setPendingDelete(null) }, t('delete.cancel')),
              h('button', { type: 'button', className: 'dfl-button is-danger', onClick: () => void confirmDelete() }, t('delete.confirm'))),
          )), document.body)
        }

        function renderTrace() {
          if (traceFile === null) return null
          const origin = traceFile.referenceOrigin || {}
          const rows = [
            [t('trace.session'), traceFile.sessionTitle || origin.sessionId || sessionId],
            [t('trace.project'), traceFile.projectName || origin.cwd || ''],
            [t('trace.time'), origin.at === undefined ? '' : formatTime(origin.at)],
            [t('trace.messageSeq'), origin.messageSeq === undefined ? '' : String(origin.messageSeq)],
            [t('trace.excerpt'), origin.excerpt || ''],
          ].filter(([, value]) => value !== '')
          return ReactDOM.createPortal(h('div', {
            className: 'dfl-confirm-modal dfl-theme',
            ...themeAttributes(preferences, scheme),
            onMouseDown: event => { if (event.target === event.currentTarget) setTraceFile(null) },
          },
          h('div', { className: 'dfl-confirm-card dfl-trace-card', role: 'dialog', 'aria-modal': true, 'aria-label': t('trace.title') },
            h('div', { className: 'dfl-confirm-title' }, t('trace.title')),
            h('div', { className: 'dfl-confirm-name', title: traceFile.path }, traceFile.name),
            h('div', { className: 'dfl-trace-path', title: traceFile.path }, traceFile.path),
            h('div', { className: 'dfl-trace-grid' }, rows.map(([label, value]) =>
              h('div', { key: label, className: 'dfl-trace-row' },
                h('span', null, label),
                h('code', { title: value }, value)))),
            h('div', { className: 'dfl-confirm-actions' },
              h('button', { type: 'button', className: 'dfl-button', onClick: () => void copyText(traceFile.path).then(ok => notify(ok ? t('toast.copied') : t('toast.copyFailed'))) }, t('menu.copyPath')),
              h('button', { type: 'button', className: 'dfl-button', onClick: () => setTraceFile(null) }, t('trace.close')))),
          ), document.body)
        }

        return h('div', { className: `dfl-root dfl-theme${selectMode ? ' is-selecting' : ''}`, ...themeAttributes(preferences, scheme) },
          renderScopeBar(),
          renderHeader(),
          renderRegionPills(),
          renderCategoryTabs(),
          renderToolbar(),
          health && health.officeKit === false && baseFiles.some(isOfficeFile)
            ? h('div', { className: 'dfl-warning', role: 'status' }, t('host.officeMissing')) : null,
          h('div', { className: 'dfl-body' }, renderFileList()),
          renderSelectionBar(),
          renderFooter(),
          pinsError && scope === 'pins' ? h('div', { className: 'dfl-warning', role: 'alert' }, pinsError) : null,
          toast !== null ? h('div', { className: 'dfl-toast', role: 'status' }, toast.text) : null,
          renderViewer(),
          renderContextMenu(),
          renderDeleteConfirm(),
          renderTrace())
      }
    }

    /** Tab title chip. */
    function createTitle(t) {
      return function FileLauncherTitle({ useTabInfo, t: translate }) {
        const { tab } = useTabInfo()
        const label = tab && tab.title ? tab.title : (translate ? translate('type.label') : t('type.label'))
        return h('span', { className: 'dfl-title-chip' }, h(LauncherGlyph, { size: 16 }), h('span', null, label))
      }
    }

    /**
     * Compact entry in the conversation header's right-aligned utilities. It
     * opens (or focuses) the File Launcher page in the right Sidebar, so the
     * panel is reachable without first opening the sidebar guide.
     */
    function createHeaderEntry(ctx, t) {
      return function FileLauncherHeaderEntry({ t: translate }) {
        const label = (translate || t)('header.open')
        const open = () => {
          try {
            ctx.sidebarRight.openTab(KIND)
          } catch (error) {
            try { console.error('[file-launcher] could not open the right sidebar', error) } catch { /* ignore */ }
          }
        }
        return h('button', {
          type: 'button',
          className: 'dfl-header-entry',
          title: label,
          'aria-label': label,
          onClick: open,
        }, h(LauncherGlyph, { size: 16 }))
      }
    }

    /**
     * Compact entry at the left of the composer tool row. It is the always
     * visible quick entry: one click opens (or focuses) the File Launcher page
     * in the right Sidebar without opening the guide first.
     */
    function createComposerEntry(ctx, t) {
      return function FileLauncherComposerEntry({ t: translate }) {
        const label = (translate || t)('entry.label')
        const open = () => {
          try {
            ctx.sidebarRight.openTab(KIND)
          } catch (error) {
            try { console.error('[file-launcher] could not open the right sidebar', error) } catch { /* ignore */ }
          }
        }
        return h('button', {
          type: 'button',
          className: 'dfl-composer-entry',
          title: (translate || t)('header.open'),
          'aria-label': (translate || t)('header.open'),
          onClick: open,
        }, h(LauncherGlyph, { size: 14 }), h('span', { className: 'dfl-composer-entry-label' }, label))
      }
    }

    /* ─────────────────────────── plugin body ─────────────────────────── */

    /** Settings section contributed to the DSH Settings modal. */
    function createSettingsSection(t) {
      return function FileLauncherSettings() {
        const [form, setForm] = useState(null)
        const [paths, setPaths] = useState(null)
        const [status, setStatus] = useState('')
        const [saving, setSaving] = useState(false)
        const scheme = useResolvedScheme(form?.appearanceTheme || 'host')

        useEffect(() => {
          let alive = true
          api('/api/file-launcher.settings')
            .then(value => {
              if (!alive) return
              setForm(value.settings)
              setPaths(value.paths)
            })
            .catch(caught => {
              if (!alive) return
              setForm({
                autoRefresh: true,
                refreshSeconds: 60,
                defaultScope: 'session',
                collapseGroups: true,
                pdfMaxPages: 20,
                pdfDpi: 110,
                maxRows: 800,
                archiveDir: '',
                ...readLocalAppearance(),
              })
              setStatus(caught instanceof Error ? caught.message : String(caught))
            })
          return () => { alive = false }
        }, [])

        const update = (key, value) => {
          if (form === null) return
          const next = { ...form, [key]: value }
          setForm(next)
          if (APPEARANCE_FIELDS.includes(key)) {
            // Appearance is display-local: apply it to an already-open Sidebar
            // immediately instead of waiting for Save, then persist it so it
            // survives a reload.
            writeLocalAppearance(next)
            void api('/api/file-launcher.settings', {
              method: 'POST',
              body: JSON.stringify({ settings: next }),
            }).then(value => {
              if (value && value.settings) {
                const saved = { ...value.settings, ...readLocalAppearance() }
                setForm(saved)
                applyDocumentTheme(saved)
              }
            }).catch(() => {})
          }
        }
        const save = async () => {
          if (form === null) return
          setSaving(true)
          setStatus('')
          try {
            const value = await api('/api/file-launcher.settings', {
              method: 'POST',
              body: JSON.stringify({ settings: form }),
            })
            const saved = value && value.settings ? value.settings : form
            writeLocalAppearance(saved)
            setForm({ ...saved, ...readLocalAppearance() })
            if (value && value.paths) setPaths(value.paths)
            else {
              api('/api/file-launcher.settings').then(latest => {
                if (latest && latest.paths) setPaths(latest.paths)
              }).catch(() => {})
            }
            window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: saved }))
            setStatus(t('settings.saved'))
          } catch (caught) {
            setStatus(caught instanceof Error ? caught.message : String(caught))
          } finally {
            setSaving(false)
          }
        }

        if (form === null) {
          return h('div', { className: 'dfl-settings dfl-settings-loading' },
            h('span', { className: 'dfl-spinner', 'aria-hidden': true }),
            h('span', null, t('settings.loading')))
        }

        const row = (label, control, hint) => h('label', { className: 'dfl-settings-row' },
          h('span', { className: 'dfl-settings-label' },
            h('span', null, label),
            hint ? h('span', { className: 'dfl-settings-hint' }, hint) : null),
          control)

        return h('div', { className: 'dfl-settings dfl-theme', ...themeAttributes(form, scheme) },
          h('div', { className: 'dfl-settings-heading' },
            h('h2', null, t('settings.title')),
            h('p', null, t('settings.description'))),
          h('section', { className: 'dfl-settings-card' },
            h('h3', null, t('settings.appearance')),
            h('div', { className: 'dfl-settings-row dfl-settings-theme-row' },
              h('span', { className: 'dfl-settings-label' },
                h('span', null, t('settings.theme')),
                h('span', { className: 'dfl-settings-hint' }, t('settings.themeHint'))),
              h('div', { className: 'dfl-theme-picker', role: 'group', 'aria-label': t('settings.theme') },
                ...[['host', 'settings.themeHost'], ['light', 'settings.themeLight'], ['dark', 'settings.themeDark'], ['system', 'settings.themeSystem']].map(([value, key]) =>
                  h('button', {
                    key: value,
                    type: 'button',
                    className: `dfl-theme-option${form.appearanceTheme === value ? ' is-active' : ''}`,
                    'aria-pressed': form.appearanceTheme === value,
                    onClick: () => update('appearanceTheme', value),
                  }, t(key)))))),
          h('section', { className: 'dfl-settings-card' },
            h('h3', null, t('settings.behavior')),
            row(t('settings.autoRefresh'), h('input', {
              type: 'checkbox', checked: form.autoRefresh,
              onChange: event => update('autoRefresh', event.target.checked),
            })),
            row(t('settings.refreshSeconds'), h('input', {
              type: 'number', min: 5, max: 300, value: form.refreshSeconds,
              disabled: !form.autoRefresh,
              onChange: event => update('refreshSeconds', Number(event.target.value)),
            })),
            row(t('settings.defaultScope'), h('select', {
              value: form.defaultScope,
              onChange: event => update('defaultScope', event.target.value),
            },
            h('option', { value: 'session' }, t('scope.session')),
            h('option', { value: 'sent' }, t('scope.sent')),
            h('option', { value: 'project' }, t('scope.project')))),
            row(t('settings.collapseGroups'), h('input', {
              type: 'checkbox', checked: form.collapseGroups,
              onChange: event => update('collapseGroups', event.target.checked),
            }), t('settings.collapseHint'))),
          h('section', { className: 'dfl-settings-card' },
            h('h3', null, t('settings.preview')),
            row(t('settings.pdfMaxPages'), h('input', {
              type: 'number', min: 1, max: 40, value: form.pdfMaxPages,
              onChange: event => update('pdfMaxPages', Number(event.target.value)),
            })),
            row(t('settings.pdfDpi'), h('input', {
              type: 'number', min: 80, max: 160, value: form.pdfDpi,
              onChange: event => update('pdfDpi', Number(event.target.value)),
            }), t('settings.pdfHint')),
            row(t('settings.maxRows'), h('input', {
              type: 'number', min: 100, max: 2000, step: 100, value: form.maxRows,
              onChange: event => update('maxRows', Number(event.target.value)),
            }), t('settings.maxRowsHint'))),
          h('section', { className: 'dfl-settings-card' },
            h('h3', null, t('settings.paths')),
            row(t('settings.archiveDirCustom'),
              h('div', { className: 'dfl-settings-text-wrap' },
                h('input', {
                  type: 'text',
                  className: 'dfl-settings-text',
                  value: form.archiveDir || '',
                  placeholder: t('settings.archiveDirPlaceholder'),
                  onChange: event => update('archiveDir', event.target.value),
                }),
                form.archiveDir ? h('button', {
                  type: 'button',
                  className: 'dfl-settings-clear',
                  onClick: () => update('archiveDir', ''),
                }, t('settings.resetDefault')) : null),
              t('settings.archiveDirHint')),
            paths !== null ? h('div', { className: 'dfl-settings-path' }, h('span', null, t('settings.dataDir')), h('code', null, paths.directory)) : null,
            paths !== null ? h('div', { className: 'dfl-settings-path' }, h('span', null, t('settings.sentIndex')), h('code', null, paths.sentIndex)) : null,
            paths !== null ? h('div', { className: 'dfl-settings-path' }, h('span', null, t('settings.archiveDir')), h('code', null, paths.archiveRoot)) : null),
          h('div', { className: 'dfl-settings-actions' },
            status ? h('span', { className: 'dfl-settings-status', role: 'status' }, status) : null,
            h('button', {
              type: 'button', className: 'dfl-settings-save', disabled: saving,
              onClick: save,
            }, saving ? t('settings.saving') : t('settings.save'))))
      }
    }

    /** Required client services. */
    const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'remote', 'remote.session', 'remote.workspaceFiles']

    /** Normalize any slot or registry return value into a plain cleanup callback. */
    function asDisposer(handle) {
      if (typeof handle === 'function') return handle
      if (handle && typeof handle.dispose === 'function') {
        return () => { try { handle.dispose() } catch {} }
      }
      return () => {}
    }

    /** Browser plugin body. */
    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      const officeKitRef = { value: undefined }
      // Load the optional Office converter lazily: profiles without office-kit
      // keep the rest of the plugin working, while standard Desktop/Web
      // profiles expose remote.officeKit here.
      ctx.inject?.(['remote', 'remote.officeKit'], scope => {
        officeKitRef.value = scope.remote.officeKit
        return () => { officeKitRef.value = undefined }
      })
      const Panel = createPanel(ctx, officeKitRef)
      const Title = createTitle(t)
      const HeaderEntry = createHeaderEntry(ctx, t)
      const ComposerEntry = createComposerEntry(ctx, t)
      const SettingsSection = createSettingsSection(t)

      const safeSlot = (name, register) => {
        if (!ctx.slots || typeof ctx.slots.inject !== 'function' || typeof ctx.slots.register !== 'function') return () => {}
        try {
          return asDisposer(ctx.slots.inject(name, () => {
            try {
              return register()
            } catch {
              return undefined
            }
          }))
        } catch {
          return () => {}
        }
      }

      ctx.effect(() => asDisposer(ctx.locale.register(NS, { zh, en })), 'file-launcher: dictionaries')

      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-plugin-css', ID)
        style.textContent = CSS
        document.head.appendChild(style)
        return () => { style.remove() }
      }, 'file-launcher: styles')

      ctx.effect(() => asDisposer(ctx.sidebarRightTabs.register({
        id: ID,
        kind: KIND,
        priority: 'builtin',
        title: () => t('type.label'),
        guide: [{
          id: 'open',
          order: 30,
          title: () => t('guide.title'),
          description: () => t('guide.description'),
          icon: LauncherGlyph,
        }],
      })), 'file-launcher: tab type')

      ctx.effect(() => safeSlot('conversation.session.header.utilities', () => ctx.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'file-launcher.header',
        order: 20,
        locale: NS,
      }, HeaderEntry)), 'file-launcher: header entry')

      ctx.effect(() => safeSlot('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left',
        id: 'file-launcher.composer',
        order: 20,
        locale: NS,
      }, ComposerEntry)), 'file-launcher: composer entry')

      ctx.effect(() => safeSlot('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'file-launcher.settings',
        order: 24,
        label: () => t('settings.title'),
        locale: NS,
      }, SettingsSection)), 'file-launcher: settings section')

      ctx.effect(() => safeSlot('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: ID,
        locale: NS,
      }, Panel)), 'file-launcher: panel body')

      ctx.effect(() => safeSlot('sidebar.right.pane.tab.title', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab.title',
        key: ID,
        locale: NS,
      }, Title)), 'file-launcher: panel title')
    }

    /* ─────────────────────────── locale ─────────────────────────── */

    const zh = {
      'type.label': '文件启动器',
      'settings.title': '文件启动器',
      'settings.description': '配置文件启动器的刷新、默认范围、预览渲染和数据上限。设置保存在当前 DSH 用户目录，升级插件不会丢失。',
      'settings.behavior': '行为',
      'settings.appearance': '外观',
      'settings.theme': '主题',
      'settings.themeHint': '插件界面使用深色、浅色，或跟随 DSH / 系统。',
      'settings.themeHost': '跟随 DSH',
      'settings.themeLight': '浅色',
      'settings.themeDark': '深色',
      'settings.themeSystem': '跟随系统',
      'settings.autoRefresh': '面板打开时自动刷新',
      'settings.refreshSeconds': '刷新间隔（秒）',
      'settings.defaultScope': '默认打开范围',
      'settings.collapseGroups': '项目/会话默认收起',
      'settings.collapseHint': '关闭后默认展开所有分组。',
      'settings.preview': '预览',
      'settings.pdfMaxPages': 'PDF 最大渲染页数',
      'settings.pdfDpi': 'PDF 渲染 DPI',
      'settings.pdfHint': '越高越清晰，也越占内存。',
      'settings.maxRows': '单次加载上限',
      'settings.maxRowsHint': '100–2000；越大越占内存。',
      'settings.paths': '数据位置',
      'settings.dataDir': '数据目录',
      'settings.sentIndex': '我发送的索引',
      'settings.archiveDir': '归档目录',
      'settings.archiveDirCustom': '自定义归档目录',
      'settings.archiveDirPlaceholder': '留空则使用默认“文档”目录',
      'settings.archiveDirHint': '可填写本地目录路径；留空使用系统文档下的默认目录。',
      'settings.resetDefault': '恢复默认',
      'settings.save': '保存设置',
      'settings.saving': '保存中…',
      'settings.saved': '已保存',
      'settings.loading': '正在读取设置…',
      'guide.title': '文件启动器',
      'guide.description': '列出本对话产出与交付的文件，预览、用本机软件打开、收藏或归档',
      'header.open': '在右侧栏打开文件启动器',
      'entry.label': '文件',
      'scope.label': '文件范围',
      'scope.session': '当前对话',
      'scope.sent': '我发送的',
      'scope.sentTitle': '我发送的 · 全项目与对话',
      'scope.project': '当前项目',
      'scope.pins': '收藏',
      'scope.pinsTitle': '★ 收藏保留清单（防上下文压缩）',
      'scope.history': '历史对话',
      'scope.convKind': '对话',
      'scope.historyKind': '历史',
      'scope.historyProjKind': '历史项目',
      'scope.allKind': '全部',
      'scope.sentAllKind': '全项目',
      'scope.allRegions': '全部项目与对话',
      'scope.noWorkspaceShort': '无工作区目录',
      'scope.sentGroupTitle': '我发送的 · 范围切换',
      'scope.pinsGroupTitle': '★ 收藏保留 · 范围切换',
      'scope.sentTreeTitle': '按项目与对话隔离筛选',
      'scope.pinsTreeTitle': '按项目与对话隔离筛选',
      'scope.sentAllOption': '全部项目与对话（按项目→对话分类）',
      'scope.pinsAllOption': '全部收藏清单',
      'scope.projectGroupTitle': '工作区项目目录',
      'scope.projStat': '{count} 项目',
      'scope.regionStripLabel': '范围',
      'scope.showProject': '查看当前项目 ({count})',
      'scope.showAll': '查看全部项目 ({count})',
      'scope.current': '当前',
      'scope.currentSessionGroup': '当前对话与工作区',
      'scope.isolationHint': '根据下方选中标签动态切换隔离范围：支持按对话、项目或全项目分类查看',
      'scope.sessionCount': '{count} 对话',
      'tab.session': '本次产出',
      'tab.sent': '我发送的',
      'tab.pinned': '★ 收藏',
      'tab.project': '当前项目',
      'action.refresh': '刷新',
      'action.select': '选择',
      'action.done': '退出',
      'action.backCurrent': '返回当前',
      'action.backCurrentHint': '切回当前正在进行的对话',
      'action.preview': '在侧边栏预览',
      'action.previewInline': '在面板内预览',
      'action.menu': '打开方式',
      'action.actions': '操作',
      'action.folder': '在资源管理器中打开',
      'action.addToInput': '插入引用',
      'action.insertShort': '插入',
      'action.insertHint': '直接将 @ 引用插入到对话输入框',
      'action.attachFiles': '作为附件',
      'action.attachFilesHint': '作为真实附件拖入输入框（大文件/目录自动转为 @ 引用）',
      'action.pin': '收藏',
      'action.unpin': '取消收藏',
      'action.archive': '归档',
      'action.copyPath': '复制路径',
      'action.copyRef': '复制引用',
      'action.copyRefHint': '复制 @ 引用文本到剪贴板',
      'search.placeholder': '搜索文件名、路径、后缀或类型...',
      'history.search': '搜索历史对话',
      'sort.label': '排序',
      'sort.time': '时间↓',
      'sort.timeAsc': '时间↑',
      'sort.name': '名称',
      'sort.type': '类型',
      'group.unknown': '未知项目',
      'group.standalone': '独立对话（无工作区）',
      'group.workspace': '工作区文件',
      'group.untitled': '未命名会话',
      'filter.label': '类型筛选',
      'filter.button': '筛选',
      'filter.title': '筛选',
      'filter.clearAll': '清除全部',
      'filter.typeSection': '类型 (Type)',
      'filter.sourceSection': '来源 (Source)',
      'filter.withinAll': '全部类型内',
      'filter.withinAllSources': '全部来源内',
      'filter.within': '在「{value}」内',
      'filter.typeLabel': '类型',
      'filter.typeAll': '全部类型',
      'filter.allFiles': '全部文件',
      'filter.recommended': '全部推荐',
      'filter.allSent': '全部发送',
      'filter.allPinned': '全部收藏',
      'filter.allArchived': '全部归档',
      'filter.archivedHint': '切换只看已归档备份的文件',
      'context.isolation': '隔离范围',
      'context.project': '项目',
      'context.allProjects': '所有项目',
      'context.noProject': '无项目',
      'group.byCategory': '按类型',
      'group.byProject': '按项目',
      'group.flat': '平铺',
      'filter.byType': '按类型筛选',
      'filter.bySource': '按来源筛选',
      'filter.clear': '清除筛选',
      'filter.files': '{count} 个文件',
      'filter.sourceLabel': '来源筛选',
      'filter.sourceKey': '来源',
      'filter.sourceAll': '全部来源',
      'filter.archived': '已归档',
      'filter.all': '全部',
      'filter.document': 'Word',
      'filter.slides': 'PPT',
      'filter.sheets': 'Excel',
      'filter.pdf': 'PDF',
      'filter.markdown': 'Markdown',
      'filter.text': '文本/配置',
      'filter.image': '图片',
      'filter.web': '网页/样式',
      'filter.code': '代码',
      'filter.media': '音视频',
      'filter.archive': '压缩包',
      'filter.design': '设计稿',
      'filter.executable': '可执行',
      'filter.database': '数据库',
      'filter.font': '字体',
      'filter.disk': '磁盘镜像',
      'filter.binary': '二进制',
      'filter.folder': '文件夹',
      'filter.other': '其他',
      'source.delivered': '对话交付',
      'source.written': 'AI 生成',
      'source.edited': 'AI 修改',
      'source.attachment': '我发送的',
      'source.reference': '对话引用',
      'source.archived': '已归档',
      'source.missing': '不存在',
      'source.moved': '已移动',
      'badge.antiCompaction': '★防压缩',
      'source.missingHint': '原路径不存在，文件可能已删除或移动到其他磁盘。',
      'reference.badge': '引用',
      'reference.trace': '查看引用来源',
      'menu.trace': '追溯引用位置',
      'trace.title': '引用来源',
      'trace.session': '来源会话',
      'trace.project': '项目',
      'trace.time': '引用时间',
      'trace.messageSeq': '消息位置',
      'trace.excerpt': '原始内容',
      'trace.close': '关闭',
      'toast.missing': '文件不存在，可能已删除或移动',
      'source.read': '参考读取',
      'source.workspace': '工作区',
      'source.pinned': '防压缩收藏',
      'select.count': '已选 {count} 项',
      'select.all': '全选',
      'select.clear': '清空',
      'select.row': '选择 {name}',
      'menu.title': '选择操作…',
      'menu.inline': '在面板内预览',
      'menu.preview': '在侧边栏打开',
      'menu.apps': '用本机软件打开',
      'menu.defaultSuffix': '（默认）',
      'menu.detecting': '正在检测可用的打开方式…',
      'menu.reveal': '在资源管理器中显示',
      'menu.openAs': '选择打开方式…',
      'menu.copyPath': '复制完整路径',
      'menu.copyRef': '复制 @ 引用',
      'menu.copyImage': '复制图片',
      'menu.attach': '插入 @ 引用',
      'menu.delete': '删除文件…',
      'menu.forget': '移除不存在记录',
      'menu.noApps': '未检测到关联软件',
      'menu.hostOutdated': '需重启 DSH（或重开插件）以加载新版检测接口',
      'menu.pin': '收藏路径（防上下文压缩）',
      'menu.unpin': '取消收藏',
      'menu.archive': '归档副本（原文件保留）',
      'menu.noDesktop': '当前宿主没有桌面打开能力；仍可在面板内预览或复制路径。',
      'empty.title': '没有找到文件',
      'empty.session': '这个对话还没有产出、交付或接收文件。',
      'empty.sent': '这个对话里还没有你发送的文件。',
      'empty.project': '这个项目和对话中还没有可读的文档。',
      'empty.pins': '还没有收藏文件。在文件行的“打开方式”里选择收藏，或勾选后点“收藏”。',
      'empty.history': '没有其他历史对话。',
      'empty.filtered': '没有符合当前搜索或类型筛选的文件。',
      'history.choose': '选择一个历史对话',
      'history.back': '返回历史列表',
      'history.noProject': '无工作区',
      'history.updated': '更新于 {time}',
      'history.count': '{count} 个历史对话',
      'history.emptyTitle': '没有找到对话',
      'loading': '正在读取文件…',
      'loading.comfort.session': '正在为您整理本次对话的产出与关联文件，请稍候…',
      'loading.comfort.sent': '正在为您归整发送与 @引用文件记录，请稍候…',
      'loading.comfort.project': '正在扫描当前项目目录并对齐结构，请稍候…',
      'loading.comfort.sessionMid': '本次对话记录较丰富，正在仔细梳理中，不用着急…',
      'loading.comfort.sentMid': '正在跨对话核对发送和引用文件，马上就好…',
      'loading.comfort.projectMid': '当前项目文件较多，正在加速扫描整理中，请再等几秒…',
      'loading.comfort.long': '内容规模较大，正在全力收尾中，请再多给一点耐心，马上呈现…',
      'loading.eta': '已用 {elapsed} 秒 · 预计共需 {low}–{high} 秒（约剩 {remain} 秒）',
      'loading.etaFinishing': '已用 {elapsed} 秒 · 资料较多，正在收尾呈现…',
      'loading.comfort.hint': '就绪后会立刻显示；您也可以随时切换上方分类。',
      'error.title': '读取失败',
      'error.retry': '重试',
      'viewer.title': '文件预览',
      'viewer.loading': '正在读取预览…',
      'viewer.converting': '正在转换 Office 文档…',
      'viewer.rendering': '正在渲染 PDF 页面…',
      'viewer.comfort.hint': '文档较大时首次排版渲染约需 10–40 秒；想立即阅读也可点下方用本机软件秒开。',
      'viewer.quickOpenNative': '用默认软件秒开',
      'viewer.quickReveal': '定位原文件',
      'viewer.renderFailed': 'PDF 页面渲染失败',
      'viewer.officeUnavailable': 'Office 预览不可用',
      'viewer.officeHostMissing': '此宿主没有 Office 转换服务（office-kit）。请使用标准 DSH Desktop/Web 包，或安装 office-kit 与 LibreOffice 支持后重启。',
      'viewer.openDefault': '用本机软件打开',
      'host.title': 'Office 预览缺的是宿主组件',
      'host.officeHelp': '插件已经安装好，不需要重装。缺的是宿主侧的 office-kit 与 LibreOffice Kit。',
      'host.checking': '正在检查当前宿主…',
      'host.officeKitMissing': '当前宿主：缺少 office-kit',
      'host.officeKitPresent': '当前宿主：office-kit 可用，但转换失败，请检查 LibreOffice Kit',
      'host.step1': '1. 点击“复制修复指令”',
      'host.step2': '2. 粘贴发送给 DSH，让 DSH 安装缺失的宿主包',
      'host.step3': '3. 让 DSH 确认 health.officeKit = true',
      'host.step4': '4. 完全退出并重开 DSH，而不是只刷新页面',
      'host.copyCommand': '复制修复指令',
      'host.openDocs': '查看宿主说明',
      'host.copiedCommand': '修复指令已复制',
      'host.commandHint': '把指令粘贴发送给 DSH，让 DSH 安装缺失包；插件本身不需要重装。',
      'host.commandText': '我的 DSH 已经安装 dsh-file-launcher，但 Office 预览提示缺少宿主 office-kit。\n请不要重装 dsh-file-launcher。\n请检查当前 DSH profile 和版本，安装/启用缺失的 @deepseek-ai/dsh-office-kit 提供方，以及匹配的 @deepseek-ai/libreoffice-kit 引擎（官方 Desktop/Web 通常已包含），然后完全重启 DSH。\n完成后检查 /api/file-launcher.health，officeKit 必须为 true；再验证 Word/PPT/Excel。',
      'host.officeMissing': '当前宿主未提供 office-kit：Word/PPT 无法在插件内转换预览。Excel 可尝试侧边栏预览，或更新为标准 DSH Desktop/Web。',
      'viewer.previousPage': '上一页',
      'viewer.nextPage': '下一页',
      'viewer.zoomIn': '放大',
      'viewer.zoomOut': '缩小',
      'viewer.fitWidth': '适合宽度',
      'viewer.truncated': '仅显示前 {count} 页',
      'viewer.textTruncated': '文件较大，仅展示前段内容；可用“在侧边栏打开”查看完整文件。',
      'viewer.previous': '上一个',
      'viewer.next': '下一个',
      'viewer.close': '关闭预览',
      'viewer.failed': '预览失败',
      'viewer.openSidebar': '在侧边栏打开',
      'viewer.hint': 'Esc 关闭 · ← → 切换',
      'foot.count': '{count} / {total} 个文件',
      'foot.truncated': '（已截断）',
      'foot.noWorkspace': '这个会话没有工作区目录',
      'toast.pinned': '已收藏 {count} 个文件',
      'toast.pinnedPartial': '已收藏 {count} 个文件，{rejected} 个路径无法验证',
      'toast.unpinned': '已取消收藏 {count} 个文件',
      'toast.archived': '已复制归档副本 {count} 个到 {dir}；原文件保留',
      'toast.archivedPartial': '已复制归档副本 {count} 个，{failed} 个失败；原文件保留；目录：{dir}',
      'toast.archiving': '归档中…',
      'toast.opened': '已用本机软件打开',
      'toast.revealed': '已在资源管理器中显示',
      'toast.folderOpened': '已在资源管理器中打开',
      'toast.openAs': '已呼出系统“打开方式”',
      'toast.copied': '已复制',
      'toast.copyFailed': '复制失败；请手动选择文本',
      'toast.added': '已加入输入框',
      'toast.attached': '已作为附件加入输入框',
      'toast.imageCopied': '图片已复制',
      'toast.deleted': '已删除 {name}',
      'toast.forgot': '已移除不存在记录',
      'delete.title': '删除文件',
      'delete.message': '将永久删除硬盘上的这个文件，无法撤销。',
      'delete.attachmentWarning': '这是用户发送的附件对象；删除后历史会话中的引用可能无法再读取。',
      'delete.cancel': '取消',
      'delete.confirm': '删除',
      'toast.previewUnavailable': '这个文件没有可用的会话上下文，无法在侧边栏预览；可用打开方式或复制路径。',
      'toast.failed': '操作失败：{message}',
    }

    const en = {
      'type.label': 'File launcher',
      'settings.title': 'File launcher',
      'settings.description': 'Configure refresh, default scope, preview rendering, and data limits. Settings live in the current DSH home and survive plugin upgrades.',
      'settings.behavior': 'Behavior',
      'settings.appearance': 'Appearance',
      'settings.theme': 'Theme',
      'settings.themeHint': 'Use dark, light, or follow DSH / the system.',
      'settings.themeHost': 'Follow DSH',
      'settings.themeLight': 'Light',
      'settings.themeDark': 'Dark',
      'settings.themeSystem': 'Follow system',
      'settings.autoRefresh': 'Auto-refresh while the panel is open',
      'settings.refreshSeconds': 'Refresh interval (seconds)',
      'settings.defaultScope': 'Default scope',
      'settings.collapseGroups': 'Collapse projects/conversations by default',
      'settings.collapseHint': 'Turn off to expand all groups by default.',
      'settings.preview': 'Preview',
      'settings.pdfMaxPages': 'Maximum PDF pages',
      'settings.pdfDpi': 'PDF render DPI',
      'settings.pdfHint': 'Higher is sharper and uses more memory.',
      'settings.maxRows': 'Rows per load',
      'settings.maxRowsHint': '100–2000; higher uses more memory.',
      'settings.paths': 'Data locations',
      'settings.dataDir': 'Data directory',
      'settings.sentIndex': 'Sent index',
      'settings.archiveDir': 'Archive root',
      'settings.archiveDirCustom': 'Custom archive folder',
      'settings.archiveDirPlaceholder': 'Leave empty for default Documents folder',
      'settings.archiveDirHint': 'Optional folder path; leave blank to use your Documents folder.',
      'settings.resetDefault': 'Reset',
      'settings.save': 'Save settings',
      'settings.saving': 'Saving…',
      'settings.saved': 'Saved',
      'settings.loading': 'Loading settings…',
      'guide.title': 'File launcher',
      'guide.description': 'List, preview, open, pin, and archive the files this conversation produced',
      'header.open': 'Open the file launcher in the right sidebar',
      'entry.label': 'Files',
      'scope.label': 'File scope',
      'scope.session': 'Conversation',
      'scope.sent': 'Sent by me',
      'scope.sentTitle': 'Sent by me · all projects and conversations',
      'scope.project': 'Project',
      'scope.pins': 'Pinned',
      'scope.pinsTitle': '★ Pinned paths (anti-compaction)',
      'scope.history': 'History',
      'scope.convKind': 'Chat',
      'scope.historyKind': 'History',
      'scope.historyProjKind': 'Project',
      'scope.allKind': 'All',
      'scope.sentAllKind': 'All',
      'scope.allRegions': 'All projects & chats',
      'scope.noWorkspaceShort': 'No workspace',
      'scope.sentGroupTitle': 'Sent files · Region scope',
      'scope.pinsGroupTitle': '★ Pinned files · Region scope',
      'scope.sentTreeTitle': 'Filter by project & chat',
      'scope.pinsTreeTitle': 'Filter by project & chat',
      'scope.sentAllOption': 'All projects & chats (grouped)',
      'scope.pinsAllOption': 'All pinned files',
      'scope.projectGroupTitle': 'Workspace project folders',
      'scope.projStat': '{count} projects',
      'scope.regionStripLabel': 'Scope',
      'scope.showProject': 'View current project ({count})',
      'scope.showAll': 'View all projects ({count})',
      'scope.current': 'Current',
      'scope.currentSessionGroup': 'Current conversation & workspace',
      'scope.isolationHint': 'Adapts dynamically to the active tab: switch conversation, project, or all regions',
      'scope.sessionCount': '{count} chats',
      'tab.session': 'Outputs',
      'tab.sent': 'Sent',
      'tab.pinned': '★ Pinned',
      'tab.project': 'Project',
      'action.refresh': 'Refresh',
      'action.select': 'Select',
      'action.done': 'Done',
      'action.backCurrent': 'Current chat',
      'action.backCurrentHint': 'Return to the active conversation',
      'action.preview': 'Preview in sidebar',
      'action.previewInline': 'Preview here',
      'action.menu': 'Open with',
      'action.actions': 'Actions',
      'action.folder': 'Open in Explorer',
      'action.addToInput': 'Insert ref',
      'action.insertShort': 'Insert',
      'action.insertHint': 'Insert @ reference directly into the composer',
      'action.attachFiles': 'Attach',
      'action.attachFilesHint': 'Drop selected files as composer attachments (falls back to @ refs for folders/large files)',
      'action.pin': 'Pin',
      'action.unpin': 'Unpin',
      'action.archive': 'Archive',
      'action.copyPath': 'Copy path',
      'action.copyRef': 'Copy ref',
      'action.copyRefHint': 'Copy @ reference to clipboard',
      'search.placeholder': 'Search name, path, ext, or type...',
      'history.search': 'Search conversations',
      'sort.label': 'Sort',
      'sort.time': 'Newest↓',
      'sort.timeAsc': 'Oldest↑',
      'sort.name': 'Name',
      'sort.type': 'Type',
      'group.unknown': 'Unknown project',
      'group.standalone': 'Standalone chats',
      'group.workspace': 'Workspace files',
      'group.untitled': 'Untitled conversation',
      'filter.label': 'Type filter',
      'filter.button': 'Filters',
      'filter.title': 'Filters',
      'filter.clearAll': 'Clear all',
      'filter.typeSection': 'Type',
      'filter.sourceSection': 'Source',
      'filter.withinAll': 'in all types',
      'filter.withinAllSources': 'in all sources',
      'filter.within': 'within {value}',
      'filter.typeLabel': 'Type',
      'filter.typeAll': 'All types',
      'filter.allFiles': 'All files',
      'filter.recommended': 'Recommended',
      'filter.allSent': 'All sent',
      'filter.allPinned': 'All pinned',
      'filter.allArchived': 'All archived',
      'filter.archivedHint': 'Toggle archived files only',
      'context.isolation': 'Scope',
      'context.project': 'Project',
      'context.allProjects': 'All projects',
      'context.noProject': 'No project',
      'group.byCategory': 'By type',
      'group.byProject': 'By project',
      'group.flat': 'Flat',
      'filter.byType': 'Filter by type',
      'filter.bySource': 'Filter by source',
      'filter.clear': 'Clear filters',
      'filter.files': '{count} files',
      'filter.sourceLabel': 'Source filter',
      'filter.sourceKey': 'Source',
      'filter.sourceAll': 'All sources',
      'filter.archived': 'Archived',
      'filter.all': 'All',
      'filter.document': 'Word',
      'filter.slides': 'PPT',
      'filter.sheets': 'Excel',
      'filter.pdf': 'PDF',
      'filter.markdown': 'Markdown',
      'filter.text': 'Text / Config',
      'filter.image': 'Images',
      'filter.web': 'Web / Styles',
      'filter.code': 'Code',
      'filter.media': 'Media',
      'filter.archive': 'Archives',
      'filter.design': 'Design',
      'filter.executable': 'Executables',
      'filter.database': 'Databases',
      'filter.font': 'Fonts',
      'filter.disk': 'Disk Images',
      'filter.binary': 'Binaries',
      'filter.folder': 'Folders',
      'filter.other': 'Other',
      'source.delivered': 'Delivered',
      'source.written': 'Created',
      'source.edited': 'Edited',
      'source.attachment': 'Sent',
      'source.reference': 'Referenced',
      'source.archived': 'Archived',
      'source.missing': 'Missing',
      'source.moved': 'Moved',
      'badge.antiCompaction': '★Pinned',
      'source.missingHint': 'The original path no longer exists; the file may have been deleted or moved to another drive.',
      'reference.badge': 'Reference',
      'reference.trace': 'Show reference origin',
      'menu.trace': 'Trace reference origin',
      'trace.title': 'Reference origin',
      'trace.session': 'Source conversation',
      'trace.project': 'Project',
      'trace.time': 'Referenced at',
      'trace.messageSeq': 'Message position',
      'trace.excerpt': 'Original text',
      'trace.close': 'Close',
      'toast.missing': 'File not found; it may have been deleted or moved',
      'source.read': 'Read',
      'source.workspace': 'Workspace',
      'source.pinned': 'Pinned',
      'select.count': '{count} selected',
      'select.all': 'Select all',
      'select.clear': 'Clear',
      'select.row': 'Select {name}',
      'menu.title': 'Choose an action…',
      'menu.inline': 'Preview in panel',
      'menu.preview': 'Open in sidebar',
      'menu.apps': 'Open with a desktop app',
      'menu.defaultSuffix': ' (default)',
      'menu.detecting': 'Detecting available applications…',
      'menu.reveal': 'Show in file manager',
      'menu.openAs': 'Choose an app…',
      'menu.copyPath': 'Copy full path',
      'menu.copyRef': 'Copy @ reference',
      'menu.copyImage': 'Copy image',
      'menu.attach': 'Insert @ reference',
      'menu.delete': 'Delete file…',
      'menu.forget': 'Remove missing record',
      'menu.noApps': 'No associated application detected',
      'menu.hostOutdated': 'Restart DSH (or reload plugin) to enable desktop app detection',
      'menu.pin': 'Pin path (survives context compaction)',
      'menu.unpin': 'Unpin',
      'menu.archive': 'Archive a copy (original kept)',
      'menu.noDesktop': 'This host has no desktop opening capability. Preview or copy the path instead.',
      'empty.title': 'No files found',
      'empty.session': 'This conversation has not produced, delivered, or received a file yet.',
      'empty.sent': 'You have not sent a file in this conversation yet.',
      'empty.project': 'No readable documents exist in this project or conversation yet.',
      'empty.pins': 'No pinned files yet. Use “Open with” → Pin on a row, or select rows and choose Pin.',
      'empty.history': 'No other conversations were found.',
      'empty.filtered': 'No file matches the current search or type filter.',
      'history.choose': 'Choose a conversation',
      'history.back': 'Back to history',
      'history.noProject': 'No workspace',
      'history.updated': 'Updated {time}',
      'history.count': '{count} conversations',
      'history.emptyTitle': 'No conversations found',
      'loading': 'Reading files…',
      'loading.comfort.session': 'Organizing deliverables and files from this conversation…',
      'loading.comfort.sent': 'Gathering files and @references you sent across conversations…',
      'loading.comfort.project': 'Scanning the current project workspace and organizing files…',
      'loading.comfort.sessionMid': 'This conversation has rich history—still sorting cleanly, just a moment…',
      'loading.comfort.sentMid': 'Checking sent files and references across sessions—almost ready…',
      'loading.comfort.projectMid': 'This project has many files—speeding through the directory scan, hang tight…',
      'loading.comfort.long': 'Large workspace or history—finishing up the final pass, thanks for your patience…',
      'loading.eta': 'Elapsed {elapsed}s · Est. {low}–{high}s (~{remain}s left)',
      'loading.etaFinishing': 'Elapsed {elapsed}s · Finishing final pass…',
      'loading.comfort.hint': 'Results appear automatically once ready; feel free to switch tabs anytime.',
      'error.title': 'Could not read files',
      'error.retry': 'Retry',
      'viewer.title': 'File preview',
      'viewer.loading': 'Reading preview…',
      'viewer.converting': 'Converting Office document…',
      'viewer.rendering': 'Rendering PDF pages…',
      'viewer.comfort.hint': 'Large documents take 10–40s to render on first open; open with a desktop app anytime below.',
      'viewer.quickOpenNative': 'Open in default app now',
      'viewer.quickReveal': 'Reveal file',
      'viewer.renderFailed': 'PDF page rendering failed',
      'viewer.officeUnavailable': 'Office preview unavailable',
      'viewer.officeHostMissing': 'This host has no Office conversion service (office-kit). Use a standard DSH Desktop/Web bundle, or install office-kit with LibreOffice support and restart.',
      'viewer.openDefault': 'Open in default app',
      'host.title': 'Office preview is missing a host component',
      'host.officeHelp': 'The plugin is already installed; there is no need to reinstall it. The Host office-kit and LibreOffice Kit are missing.',
      'host.checking': 'Checking the current host…',
      'host.officeKitMissing': 'Current host: office-kit is missing',
      'host.officeKitPresent': 'Current host: office-kit is present, but conversion failed; check the LibreOffice Kit',
      'host.step1': '1. Click “Copy repair command”',
      'host.step2': '2. Paste it to DSH so DSH installs the missing host packages',
      'host.step3': '3. Have DSH confirm health.officeKit = true',
      'host.step4': '4. Fully quit and reopen DSH, not just reload the page',
      'host.copyCommand': 'Copy repair command',
      'host.openDocs': 'Host requirements',
      'host.copiedCommand': 'Repair command copied',
      'host.commandHint': 'Paste this into DSH so it installs the missing packages; do not reinstall the plugin.',
      'host.commandText': 'My DSH already has dsh-file-launcher installed, but Office preview reports that the host office-kit is missing.\nDo not reinstall dsh-file-launcher.\nInspect the current DSH profile and version, install/enable the missing @deepseek-ai/dsh-office-kit provider and a matching @deepseek-ai/libreoffice-kit engine (the official Desktop/Web bundle normally includes them), then fully restart DSH.\nAfterwards check /api/file-launcher.health: officeKit must be true, then verify Word/PPT/Excel.',
      'host.officeMissing': 'This host does not provide office-kit: Word/PowerPoint cannot be converted in the panel. Try Excel in the Sidebar preview, or update to a standard DSH Desktop/Web bundle.',
      'viewer.previousPage': 'Previous page',
      'viewer.nextPage': 'Next page',
      'viewer.zoomIn': 'Zoom in',
      'viewer.zoomOut': 'Zoom out',
      'viewer.fitWidth': 'Fit width',
      'viewer.truncated': 'First {count} pages only',
      'viewer.textTruncated': 'Preview shows the beginning of a large file; open in sidebar for full contents.',
      'viewer.previous': 'Previous',
      'viewer.next': 'Next',
      'viewer.close': 'Close preview',
      'viewer.failed': 'Preview failed',
      'viewer.openSidebar': 'Open in sidebar',
      'viewer.hint': 'Esc to close · ← → to switch',
      'foot.count': '{count} / {total} files',
      'foot.truncated': ' (truncated)',
      'foot.noWorkspace': 'This conversation has no workspace directory',
      'toast.pinned': 'Pinned {count} file(s)',
      'toast.pinnedPartial': 'Pinned {count} file(s); {rejected} path(s) could not be verified',
      'toast.unpinned': 'Unpinned {count} file(s)',
      'toast.archived': 'Copied {count} archived file(s) to {dir}; originals kept',
      'toast.archivedPartial': 'Copied {count} archived file(s); {failed} failed; originals kept; folder: {dir}',
      'toast.archiving': 'Archiving…',
      'toast.opened': 'Opened in a desktop application',
      'toast.revealed': 'Shown in the file manager',
      'toast.folderOpened': 'Opened in Explorer',
      'toast.openAs': 'Opened the system “Open with” dialog',
      'toast.copied': 'Copied',
      'toast.copyFailed': 'Copy failed; select the text manually',
      'toast.added': 'Added to the composer',
      'toast.attached': 'Attached to the composer',
      'toast.imageCopied': 'Image copied',
      'toast.deleted': 'Deleted {name}',
      'toast.forgot': 'Missing record removed',
      'delete.title': 'Delete file',
      'delete.message': 'This permanently deletes the file from disk and cannot be undone.',
      'delete.attachmentWarning': 'This is a user attachment object; deleting it may make historical references unreadable.',
      'delete.cancel': 'Cancel',
      'delete.confirm': 'Delete',
      'toast.previewUnavailable': 'This file has no conversation context to preview from; use Open with or copy the path.',
      'toast.failed': 'Action failed: {message}',
    }

    /* ─────────────────────────── styles ─────────────────────────── */

    const CSS = `
.dfl-theme {
  --dfl-bg-canvas: var(--dsw-alias-bg-base, #f7f7f8);
  --dfl-bg-card: var(--dsw-alias-bg-layer-1, #ffffff);
  --dfl-bg-subtle: var(--dsw-alias-bg-layer-2, #eff0f1);
  --dfl-bg-fill: color-mix(in srgb, var(--dfl-ink) 6%, transparent);
  --dfl-bg-field: color-mix(in srgb, var(--dfl-ink) 4.5%, transparent);
  --dfl-border: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.13));
  --dfl-border-soft: color-mix(in srgb, var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.08)) 70%, transparent);
  --dfl-ink: var(--dsw-alias-label-primary, #1d1f21);
  --dfl-ink-2: var(--dsw-alias-label-secondary, #3d4348);
  --dfl-ink-3: var(--dsw-alias-label-tertiary, #5d676f);
  --dfl-ink-4: var(--dsw-alias-label-caption, #9da5ab);
  --dfl-hover: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  --dfl-active: var(--dsw-alias-interactive-bg-active, rgba(0, 0, 0, 0.09));
  --dfl-accent: var(--dsw-alias-state-business-primary, #007acc);
  --dfl-danger: var(--dsw-alias-state-error-primary, #dc2626);
  --dfl-warning: var(--dsw-alias-state-warning-primary, #d97706);
  --dfl-ref-accent: #4f46e5;
  --dfl-star: #f59e0b;
  --dfl-popover-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  --dfl-card-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  --dfl-viewer-stage: color-mix(in srgb, var(--dfl-bg-subtle) 84%, var(--dfl-bg-canvas));
  color: var(--dfl-ink);
}
.dfl-theme[data-dfl-scheme="light"],
html[data-dfl-theme="light"] .dfl-theme {
  color-scheme: light;
  --dsw-alias-bg-base: #f7f7f8;
  --dsw-alias-bg-layer-1: #ffffff;
  --dsw-alias-bg-layer-2: #eff0f1;
  --dsw-alias-border-l3: rgba(0, 0, 0, 0.12);
  --dsw-alias-label-primary: #1d1f21;
  --dsw-alias-label-secondary: #3d4348;
  --dsw-alias-label-tertiary: #5d676f;
  --dsw-alias-label-caption: #9da5ab;
  --dsw-alias-interactive-bg-hover: rgba(0, 0, 0, 0.05);
  --dsw-alias-interactive-bg-active: rgba(0, 0, 0, 0.09);
  --dsw-alias-state-business-primary: #007acc;
  --dsw-alias-state-error-primary: #dc2626;
  --dsw-alias-state-warning-primary: #d97706;
  --dsw-focus-ring-color: #007acc;
  --dfl-ref-accent: #4f46e5;
  --dfl-star: #f59e0b;
  --dfl-popover-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  --dfl-viewer-stage: #e9eaee;
  color: var(--dfl-ink);
}
.dfl-theme[data-dfl-scheme="dark"],
html[data-dfl-theme="dark"] .dfl-theme {
  color-scheme: dark;
  --dsw-alias-bg-base: #0d0d0f;
  --dsw-alias-bg-layer-1: #141417;
  --dsw-alias-bg-layer-2: #1c1c21;
  --dsw-alias-border-l3: rgba(255, 255, 255, 0.14);
  --dsw-alias-label-primary: #ececf1;
  --dsw-alias-label-secondary: #b4b4be;
  --dsw-alias-label-tertiary: #7d7d8a;
  --dsw-alias-label-caption: #5a5a66;
  --dsw-alias-interactive-bg-hover: rgba(255, 255, 255, 0.06);
  --dsw-alias-interactive-bg-active: rgba(255, 255, 255, 0.11);
  --dsw-alias-state-business-primary: #60a5fa;
  --dsw-alias-state-error-primary: #f87171;
  --dsw-alias-state-warning-primary: #fbbf24;
  --dsw-focus-ring-color: #60a5fa;
  --dfl-ref-accent: #a5b4fc;
  --dfl-star: #fbbf24;
  --dfl-popover-shadow: 0 10px 28px rgba(0, 0, 0, 0.6);
  --dfl-card-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  --dfl-viewer-stage: #09090b;
  color: var(--dfl-ink);
}
.dfl-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
  color: var(--dfl-ink);
  background: var(--dfl-bg-canvas);
  font-size: 13px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
.dfl-root *, .dfl-root *::before, .dfl-root *::after,
.dfl-viewer-modal *, .dfl-confirm-modal *, .dfl-context-layer *, .dfl-filter-popover *, .dfl-scope-dropdown * { box-sizing: border-box; }

/* ── Row 1: Top Scope Dropdown Bar (Antigravity #scopeBar) ── */
.dfl-scope-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 5px;
  border-bottom: 1px solid var(--dfl-border-soft);
  background: var(--dfl-bg-card);
  flex: none;
}
.dfl-scope-bar-label {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--dfl-ink-3);
  white-space: nowrap;
  flex: none;
}
.dfl-scope-select-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}
.dfl-scope-trigger {
  width: 100%;
  height: 26px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  border-radius: 6px;
  border: 1px solid var(--dfl-border);
  background: var(--dfl-bg-canvas);
  color: var(--dfl-ink);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
  text-align: left;
  transition: background-color 120ms ease, border-color 120ms ease;
}
.dfl-scope-trigger:hover, .dfl-scope-trigger.is-open {
  background: var(--dfl-hover);
  border-color: var(--dfl-accent);
}
.dfl-scope-trigger-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}
.dfl-scope-kind-badge {
  font-size: 9.5px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--dfl-accent) 14%, transparent);
  color: var(--dfl-accent);
  flex: none;
  line-height: 1.3;
}
.dfl-scope-kind-badge.is-history {
  background: color-mix(in srgb, #f59e0b 16%, transparent);
  color: #d97706;
}
.dfl-scope-trigger-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--dfl-ink);
}
.dfl-scope-trigger-right {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--dfl-ink-3);
  flex: none;
  font-variant-numeric: tabular-nums;
}
.dfl-scope-proj-stat {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 99px;
  background: var(--dfl-bg-fill);
  color: var(--dfl-ink-3);
  white-space: nowrap;
  flex: none;
  font-variant-numeric: tabular-nums;
}
.dfl-scope-back-btn {
  height: 24px;
  padding: 0 7px;
  border-radius: 5px;
  border: 1px solid color-mix(in srgb, var(--dfl-accent) 40%, transparent);
  background: color-mix(in srgb, var(--dfl-accent) 10%, transparent);
  color: var(--dfl-accent);
  font: inherit;
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  flex: none;
}
.dfl-scope-back-btn:hover {
  background: color-mix(in srgb, var(--dfl-accent) 18%, transparent);
}
.dfl-scope-dropdown {
  position: fixed;
  z-index: 10002;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--dfl-bg-card);
  border: 1px solid var(--dfl-border);
  border-radius: 8px;
  box-shadow: var(--dfl-popover-shadow);
  padding: 5px;
  color: var(--dfl-ink);
  font-size: 11.5px;
}
.dfl-scope-group-title {
  padding: 4px 8px 3px;
  font-size: 10px;
  font-weight: 700;
  color: var(--dfl-ink-3);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.dfl-scope-sub-group {
  padding: 4px 8px 2px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--dfl-ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dfl-scope-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--dfl-ink);
  font: inherit;
  font-size: 11.5px;
  text-align: left;
  cursor: pointer;
}
.dfl-scope-opt:hover { background: var(--dfl-hover); }
.dfl-scope-opt.is-active {
  background: color-mix(in srgb, var(--dfl-accent) 13%, transparent);
  color: var(--dfl-accent);
  font-weight: 600;
}
.dfl-scope-opt-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}
.dfl-scope-opt-icon { display: inline-flex; color: var(--dfl-ink-3); flex: none; }
.dfl-scope-opt-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dfl-scope-opt-cur {
  font-size: 9px;
  padding: 0 4px;
  border-radius: 3px;
  background: color-mix(in srgb, #10b981 18%, transparent);
  color: #10b981;
  flex: none;
}
.dfl-scope-opt-right {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: none;
  font-size: 10.5px;
  color: var(--dfl-ink-3);
}
.dfl-proj-ws-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  flex: none;
}
.dfl-scope-divider {
  height: 1px;
  background: var(--dfl-border-soft);
  margin: 4px 2px;
}
.dfl-scope-empty-hint {
  padding: 4px 8px;
  font-size: 10.5px;
  color: var(--dfl-ink-3);
}
.dfl-scope-proj-opt {
  font-weight: 600;
  margin-top: 2px;
}
.dfl-scope-nested-opt {
  padding-left: 22px;
  font-size: 11px;
  color: var(--dfl-ink-2);
}
.dfl-region-strip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--dfl-border-soft);
  background: var(--dfl-bg-canvas);
  overflow-x: auto;
  scrollbar-width: none;
  flex: none;
}
.dfl-region-strip::-webkit-scrollbar { display: none; }
.dfl-region-label {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--dfl-ink-3);
  white-space: nowrap;
  flex: none;
}
.dfl-region-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 21px;
  padding: 0 8px;
  border-radius: 5px;
  border: 1px solid var(--dfl-border-soft);
  background: var(--dfl-bg-card);
  color: var(--dfl-ink-2);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex: none;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
}
.dfl-region-pill:hover { background: var(--dfl-hover); color: var(--dfl-ink); }
.dfl-region-pill.is-active {
  background: color-mix(in srgb, var(--dfl-accent) 13%, transparent);
  color: var(--dfl-accent);
  border-color: color-mix(in srgb, var(--dfl-accent) 36%, transparent);
  font-weight: 600;
}
.dfl-region-num {
  font-size: 10px;
  opacity: 0.78;
  font-variant-numeric: tabular-nums;
}
.dfl-region-custom {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--dfl-accent);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}

/* ── Row 2: Codex Header (4 Segmented Tabs + Right Tool Buttons) ── */
.dfl-codex-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--dfl-border-soft);
  background: var(--dfl-bg-canvas);
  flex: none;
}
.dfl-seg-tabs {
  display: flex;
  gap: 2px;
  background: var(--dfl-bg-fill);
  padding: 2px;
  border-radius: 6px;
  border: 1px solid var(--dfl-border-soft);
  overflow-x: auto;
  scrollbar-width: none;
  min-width: 0;
}
.dfl-seg-tabs::-webkit-scrollbar { display: none; }
.dfl-seg-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--dfl-ink-2);
  font: inherit;
  font-size: 11.5px;
  font-weight: 500;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s ease;
}
.dfl-seg-tab:hover { color: var(--dfl-ink); }
.dfl-seg-tab.is-active,
.dfl-seg-tab[aria-pressed="true"] {
  background: var(--dfl-bg-card);
  color: var(--dfl-ink);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.dfl-seg-tab:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dfl-accent)); outline-offset: -2px; }
.dfl-seg-count {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  color: var(--dfl-ink-3);
  font-variant-numeric: tabular-nums;
}
.dfl-header-right {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: none;
}
.dfl-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 26px;
  padding: 0 7px;
  border-radius: 5px;
  border: 1px solid var(--dfl-border-soft);
  background: var(--dfl-bg-card);
  color: var(--dfl-ink-2);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s ease;
}
.dfl-icon-btn:hover {
  background: var(--dfl-hover);
  color: var(--dfl-ink);
  border-color: var(--dfl-border);
}
.dfl-icon-btn.is-active {
  background: var(--dfl-active);
  color: var(--dfl-ink);
  border-color: var(--dfl-border);
  font-weight: 500;
}
.dfl-select-toggle.is-active {
  color: var(--dfl-accent);
  border-color: color-mix(in srgb, var(--dfl-accent) 45%, transparent);
  background: color-mix(in srgb, var(--dfl-accent) 10%, var(--dfl-bg-card));
}
.dfl-refresh-btn.is-loading svg { animation: dfl-spin 0.8s linear infinite; }

/* ── Row 3: Codex Flat Category Filter Strip (Antigravity .cat-bar) ── */
.dfl-cat-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--dfl-border-soft);
  overflow-x: auto;
  flex: none;
  scrollbar-width: none;
}
.dfl-cat-bar::-webkit-scrollbar { display: none; }
.dfl-cat-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dfl-ink-3);
  font: inherit;
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.12s ease;
}
.dfl-cat-pill:hover {
  color: var(--dfl-ink);
  background: var(--dfl-hover);
}
.dfl-cat-pill.is-active {
  color: var(--dfl-ink);
  background: var(--dfl-bg-fill);
  border-color: var(--dfl-border);
  font-weight: 600;
}
.dfl-cat-num {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  opacity: 0.78;
  font-variant-numeric: tabular-nums;
}

/* ── Row 4: Search + Filter ▾ + Archived Switch + Active Chips ── */
.dfl-toolbar-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 5px;
  flex: none;
  border-bottom: 1px solid var(--dfl-border-soft);
}
.dfl-search-box {
  flex: 1;
  min-width: 0;
  height: 28px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--dfl-bg-field);
  border: 1px solid var(--dfl-border-soft);
  border-radius: 6px;
  padding: 0 8px;
  transition: border-color 120ms ease, background-color 120ms ease;
}
.dfl-search-box:focus-within {
  border-color: var(--dfl-accent);
  background: var(--dfl-bg-card);
}
.dfl-search-icon { color: var(--dfl-ink-3); flex: none; }
.dfl-search {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--dfl-ink);
  font: inherit;
  font-size: 12px;
  outline: none;
  padding: 0;
}
.dfl-search::-webkit-search-cancel-button { display: none; }
.dfl-search::placeholder { color: var(--dfl-ink-4); }
.dfl-search-clear {
  width: 17px;
  height: 17px;
  flex: none;
  border: 0;
  border-radius: 999px;
  background: var(--dfl-bg-fill);
  color: var(--dfl-ink-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}
.dfl-search-clear:hover { background: var(--dfl-active); color: var(--dfl-ink); }
.dfl-toolbar-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--dfl-border);
  background: var(--dfl-bg-card);
  color: var(--dfl-ink);
  font: inherit;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex: none;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}
.dfl-toolbar-pill-btn:hover { background: var(--dfl-hover); }
.dfl-toolbar-pill-btn.is-active,
.dfl-toolbar-pill-btn.is-open {
  border-color: var(--dfl-accent);
  color: var(--dfl-accent);
  background: color-mix(in srgb, var(--dfl-accent) 10%, transparent);
}
.dfl-toolbar-pill-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--dfl-bg-fill);
  color: var(--dfl-ink-2);
  font-variant-numeric: tabular-nums;
}
.dfl-active-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  padding: 5px 10px 6px;
  border-bottom: 1px solid var(--dfl-border-soft);
  flex: none;
}
.dfl-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--dfl-accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--dfl-accent) 28%, transparent);
  color: var(--dfl-ink);
  font-size: 10.5px;
}
.dfl-filter-chip button {
  border: none;
  background: transparent;
  color: var(--dfl-ink-3);
  cursor: pointer;
  padding: 0 1px;
  font-size: 12px;
  line-height: 1;
}
.dfl-filter-chip button:hover { color: var(--dfl-ink); }
.dfl-filter-clear-btn {
  border: none;
  background: transparent;
  color: var(--dfl-accent);
  font: inherit;
  font-size: 10.5px;
  cursor: pointer;
  padding: 2px 4px;
}
.dfl-filter-clear-btn:hover { text-decoration: underline; }

/* ── Master-Detail Source × Type Filter Popover ── */
.dfl-filter-popover {
  position: fixed;
  z-index: 10002;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--dfl-border);
  background: var(--dfl-bg-card);
  box-shadow: var(--dfl-popover-shadow);
  color: var(--dfl-ink);
  font-size: 12px;
}
.dfl-filter-panel { display: flex; flex-direction: column; gap: 6px; }
.dfl-filter-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px 6px;
  border-bottom: 1px solid var(--dfl-border-soft);
}
.dfl-filter-panel-title { font-size: 11.5px; font-weight: 600; color: var(--dfl-ink); }
.dfl-filter-clear { border: 0; background: transparent; color: var(--dfl-accent); font: inherit; font-size: 11px; font-weight: 500; cursor: pointer; padding: 2px 4px; }
.dfl-filter-clear:hover { text-decoration: underline; }
.dfl-filter-columns { display: grid; grid-template-columns: 1fr 1.15fr; column-gap: 8px; min-height: 0; overflow-y: auto; }
.dfl-filter-column { min-width: 0; display: flex; flex-direction: column; gap: 2px; max-height: 260px; overflow-y: auto; }
.dfl-filter-column.is-child { border-left: 1px solid var(--dfl-border-soft); padding-left: 8px; }
.dfl-filter-section-title { padding: 2px 6px 4px; font-size: 10px; font-weight: 600; color: var(--dfl-ink-3); }
.dfl-filter-child-title { display: flex; align-items: baseline; gap: 4px; min-width: 0; }
.dfl-filter-parent { margin-left: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dfl-ink-4); font-weight: 400; }
.dfl-filter-option {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 7px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--dfl-ink);
  font: inherit;
  font-size: 11.5px;
  text-align: left;
  cursor: pointer;
}
.dfl-filter-option:hover { background: var(--dfl-hover); }
.dfl-filter-option.is-on {
  background: color-mix(in srgb, var(--dfl-accent) 14%, transparent);
  color: var(--dfl-accent);
  font-weight: 600;
}
.dfl-filter-option-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dfl-filter-option-count { color: var(--dfl-ink-3); font-size: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }
.dfl-filter-option.is-on .dfl-filter-option-count { color: currentColor; opacity: 0.85; }
.dfl-filter-check { display: inline-flex; color: currentColor; }

/* ── Main List & Codex 38px File Row ── */
.dfl-body { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.dfl-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  scrollbar-width: thin;
}
.dfl-grouped-list { gap: 6px; padding-bottom: 16px; }
.dfl-item { min-width: 0; }
.dfl-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 38px;
  padding: 5px 8px 5px 10px;
  border-radius: 6px;
  border: 1px solid var(--dfl-border-soft);
  background: var(--dfl-bg-card);
  cursor: pointer;
  transition: border-color 0.12s ease, background-color 0.12s ease;
}
.dfl-row:hover {
  background: var(--dfl-hover);
  border-color: var(--dfl-border);
}
.dfl-row:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dfl-accent)); outline-offset: -2px; }
.dfl-row.is-open { background: var(--dfl-active); border-color: var(--dfl-border); }
.dfl-row.is-selected {
  background: color-mix(in srgb, var(--dfl-accent) 9%, var(--dfl-bg-card));
  border-color: color-mix(in srgb, var(--dfl-accent) 45%, transparent);
}
.dfl-row.is-reference {
  border-left: 2px solid color-mix(in srgb, var(--dfl-ref-accent) 55%, transparent);
}
.dfl-row.is-missing { opacity: 0.72; }
.dfl-row.is-missing .dfl-name { text-decoration: line-through; text-decoration-color: rgba(239, 68, 68, 0.45); }

/* ── Star / Checkbox Gutter ── */
.dfl-star-btn, .dfl-star-spacer {
  width: 18px;
  height: 18px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dfl-star-btn {
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--dfl-ink-4);
  cursor: pointer;
  transition: color 0.12s ease, transform 0.12s ease;
}
.dfl-star-btn:hover { color: var(--dfl-star); transform: scale(1.1); }
.dfl-star-btn.is-pinned { color: var(--dfl-star); opacity: 1; }
.dfl-check {
  appearance: none;
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  margin: 0 2px;
  flex: none;
  border-radius: 4px;
  border: 1.5px solid var(--dfl-border);
  background: var(--dfl-bg-card);
  cursor: pointer;
  display: inline-grid;
  place-items: center;
}
.dfl-check:checked { background: var(--dfl-accent); border-color: var(--dfl-accent); }
.dfl-check:checked::after {
  content: '';
  width: 3.5px;
  height: 7px;
  border: solid #fff;
  border-width: 0 1.8px 1.8px 0;
  transform: rotate(42deg) translate(-0.5px, -0.5px);
}

/* ── Category Extension Capsules (19 Categories) ── */
.dfl-icon {
  min-width: 38px;
  max-width: 44px;
  padding: 2px 5px;
  border-radius: 4px;
  border: 1px solid var(--dfl-border-soft);
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
  background: var(--dfl-bg-fill);
  color: var(--dfl-ink-2);
  overflow: hidden;
}
.dfl-icon[data-cat="document"]   { color: #1d4ed8; background: rgba(37, 99, 235, 0.10); border-color: transparent; }
.dfl-icon[data-cat="slides"]     { color: #b45309; background: rgba(217, 119, 6, 0.12); border-color: transparent; }
.dfl-icon[data-cat="sheets"]     { color: #047857; background: rgba(5, 150, 105, 0.10); border-color: transparent; }
.dfl-icon[data-cat="pdf"]        { color: #b91c1c; background: rgba(220, 38, 38, 0.10); border-color: transparent; }
.dfl-icon[data-cat="markdown"]   { color: #4338ca; background: rgba(79, 70, 229, 0.10); border-color: transparent; }
.dfl-icon[data-cat="text"]       { color: #475569; background: rgba(100, 116, 139, 0.10); border-color: transparent; }
.dfl-icon[data-cat="image"]      { color: #0e7490; background: rgba(8, 145, 178, 0.10); border-color: transparent; }
.dfl-icon[data-cat="web"]        { color: #0f766e; background: rgba(13, 148, 136, 0.10); border-color: transparent; }
.dfl-icon[data-cat="code"]       { color: #6d28d9; background: rgba(124, 58, 237, 0.10); border-color: transparent; }
.dfl-icon[data-cat="media"]      { color: #a16207; background: rgba(202, 138, 4, 0.11); border-color: transparent; }
.dfl-icon[data-cat="archive"]    { color: #3f3f46; background: rgba(82, 82, 91, 0.10); border-color: transparent; }
.dfl-icon[data-cat="design"]     { color: #be123c; background: rgba(225, 29, 72, 0.10); border-color: transparent; }
.dfl-icon[data-cat="executable"] { color: #115e59; background: rgba(15, 118, 110, 0.11); border-color: transparent; }
.dfl-icon[data-cat="database"]   { color: #0369a1; background: rgba(2, 132, 199, 0.10); border-color: transparent; }
.dfl-icon[data-cat="font"]       { color: #7e22ce; background: rgba(147, 51, 234, 0.10); border-color: transparent; }
.dfl-icon[data-cat="disk"]       { color: #3730a3; background: rgba(79, 70, 229, 0.10); border-color: transparent; }
.dfl-icon[data-cat="binary"]     { color: #334155; background: rgba(71, 85, 105, 0.11); border-color: transparent; }
.dfl-icon[data-cat="folder"]     { color: #b45309; background: rgba(217, 119, 6, 0.12); border-color: transparent; }
.dfl-icon[data-cat="other"]      { color: #475569; background: rgba(100, 116, 139, 0.10); border-color: transparent; }

.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="document"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="document"],
body[data-ds-dark-theme] .dfl-icon[data-cat="document"]   { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="slides"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="slides"],
body[data-ds-dark-theme] .dfl-icon[data-cat="slides"]     { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="sheets"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="sheets"],
body[data-ds-dark-theme] .dfl-icon[data-cat="sheets"]     { background: rgba(16, 185, 129, 0.15); color: #34d399; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="pdf"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="pdf"],
body[data-ds-dark-theme] .dfl-icon[data-cat="pdf"]        { background: rgba(239, 68, 68, 0.15); color: #f87171; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="markdown"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="markdown"],
body[data-ds-dark-theme] .dfl-icon[data-cat="markdown"]   { background: rgba(129, 140, 248, 0.15); color: #a5b4fc; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="text"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="text"],
body[data-ds-dark-theme] .dfl-icon[data-cat="text"]       { background: rgba(148, 163, 184, 0.14); color: #cbd5e1; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="image"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="image"],
body[data-ds-dark-theme] .dfl-icon[data-cat="image"]      { background: rgba(6, 182, 212, 0.15); color: #22d3ee; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="web"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="web"],
body[data-ds-dark-theme] .dfl-icon[data-cat="web"]        { background: rgba(45, 212, 191, 0.14); color: #5eead4; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="code"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="code"],
body[data-ds-dark-theme] .dfl-icon[data-cat="code"]       { background: rgba(167, 139, 250, 0.15); color: #ddd6fe; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="media"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="media"],
body[data-ds-dark-theme] .dfl-icon[data-cat="media"]      { background: rgba(250, 204, 21, 0.13); color: #fde047; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="archive"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="archive"],
body[data-ds-dark-theme] .dfl-icon[data-cat="archive"]    { background: rgba(161, 161, 170, 0.14); color: #d4d4d8; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="design"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="design"],
body[data-ds-dark-theme] .dfl-icon[data-cat="design"]     { background: rgba(251, 113, 133, 0.14); color: #fda4af; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="executable"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="executable"],
body[data-ds-dark-theme] .dfl-icon[data-cat="executable"] { background: rgba(20, 184, 166, 0.14); color: #5eead4; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="database"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="database"],
body[data-ds-dark-theme] .dfl-icon[data-cat="database"]   { background: rgba(56, 189, 248, 0.14); color: #7dd3fc; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="font"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="font"],
body[data-ds-dark-theme] .dfl-icon[data-cat="font"]       { background: rgba(192, 132, 252, 0.14); color: #e9d5ff; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="disk"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="disk"],
body[data-ds-dark-theme] .dfl-icon[data-cat="disk"]       { background: rgba(129, 140, 248, 0.14); color: #a5b4fc; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="binary"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="binary"],
body[data-ds-dark-theme] .dfl-icon[data-cat="binary"]     { background: rgba(148, 163, 184, 0.14); color: #cbd5e1; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="folder"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="folder"],
body[data-ds-dark-theme] .dfl-icon[data-cat="folder"]     { background: rgba(251, 191, 36, 0.14); color: #fcd34d; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-icon[data-cat="other"],
html[data-dfl-theme="dark"] .dfl-theme .dfl-icon[data-cat="other"],
body[data-ds-dark-theme] .dfl-icon[data-cat="other"]      { background: rgba(148, 163, 184, 0.14); color: #cbd5e1; }

/* ── Row Content & Semantic Badges (1:1 Antigravity) ── */
.dfl-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.dfl-name-line { display: flex; align-items: center; flex-wrap: nowrap; gap: 4px; min-width: 0; }
.dfl-name {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--dfl-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dfl-badge {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 9.5px;
  font-weight: 600;
  line-height: 1.4;
  padding: 0 5px;
  border-radius: 3px;
  background: var(--dfl-bg-fill);
  color: var(--dfl-ink-3);
  font-family: inherit;
}
.dfl-badge.is-delivered { color: #059669; background: rgba(16, 185, 129, 0.13); }
.dfl-badge.is-written   { color: #2563eb; background: rgba(59, 130, 246, 0.12); }
.dfl-badge.is-edited    { color: #d97706; background: rgba(245, 158, 11, 0.14); }
.dfl-badge.is-attachment { color: #7c3aed; background: rgba(139, 92, 246, 0.13); }
.dfl-badge.is-read      { color: #64748b; background: rgba(100, 116, 139, 0.13); }
.dfl-badge.is-workspace { color: #475569; background: rgba(100, 116, 139, 0.11); }
.dfl-badge.is-proj      { color: var(--dfl-ink-3); background: var(--dfl-bg-fill); font-weight: 500; }
.dfl-badge.is-pinned    { color: #d97706; background: rgba(245, 158, 11, 0.14); }
.dfl-badge.is-archived  { color: #7c3aed; background: rgba(124, 58, 237, 0.12); }
.dfl-badge.is-missing   { color: var(--dfl-danger); background: rgba(239, 68, 68, 0.13); }
.dfl-badge.is-moved     { color: #0284c7; background: rgba(14, 165, 233, 0.13); }
.dfl-badge.is-reference {
  color: var(--dfl-ref-accent);
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.25);
  cursor: pointer;
}
.dfl-badge.is-reference:hover { background: rgba(99, 102, 241, 0.2); }
.dfl-meta { display: flex; align-items: baseline; min-width: 0; color: var(--dfl-ink-3); font-size: 11px; }
.dfl-meta-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.dfl-desc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--dfl-ink-4); }

/* ── Row Actions (Antigravity 26px Compact Buttons + DSH Insert) ── */
.dfl-row-actions { display: inline-flex; align-items: center; gap: 5px; flex: none; }
.dfl-row-act-btn {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 7px;
  background: var(--dfl-bg-card);
  color: var(--dfl-ink-2);
  border: 1px solid var(--dfl-border-soft);
  border-radius: 5px;
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}
.dfl-row-act-btn:hover {
  background: var(--dfl-active);
  color: var(--dfl-accent);
  border-color: color-mix(in srgb, var(--dfl-accent) 45%, var(--dfl-border));
}
.dfl-open-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  background: var(--dfl-bg-fill);
  color: var(--dfl-ink);
  border: 1px solid var(--dfl-border);
  border-radius: 5px;
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.12s ease;
}
.dfl-open-button:hover { background: var(--dfl-active); }
.dfl-open-button:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dfl-accent)); outline-offset: 1px; }

/* ── Collapsible Category & Project -> Session Groups ── */
.dfl-group-caret { color: var(--dfl-ink-3); transition: transform 0.14s ease; }
.dfl-group-caret.is-open { transform: rotate(90deg); }
.dfl-category-group { display: flex; flex-direction: column; margin-bottom: 4px; }
.dfl-category-group-head {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  padding: 5px 4px 4px;
  border: none;
  background: transparent;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  color: var(--dfl-ink-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
  text-align: left;
  user-select: none;
}
.dfl-category-group-head:hover { color: var(--dfl-ink); }
.dfl-category-group:not(.is-open) .dfl-svg-caret { transform: rotate(-90deg); }
.dfl-group-rows { display: flex; flex-direction: column; gap: 4px; }

.dfl-file-group {
  margin-bottom: 6px;
  border: 1px solid var(--dfl-border-soft);
  border-radius: 7px;
  background: var(--dfl-bg-card);
  overflow: hidden;
}
.dfl-group-project-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 9px;
  border: none;
  background: var(--dfl-bg-fill);
  color: var(--dfl-ink);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}
.dfl-group-project-head:hover { background: var(--dfl-active); }
.dfl-group-name { flex: none; max-width: 55%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dfl-group-path {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dfl-ink-4);
  font-size: 10px;
  font-weight: 400;
  direction: rtl;
  text-align: left;
}
.dfl-group-count {
  margin-left: auto;
  flex: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  color: var(--dfl-ink-3);
  font-variant-numeric: tabular-nums;
}
.dfl-group-sessions { display: flex; flex-direction: column; }
.dfl-file-session { border-top: 1px solid var(--dfl-border-soft); }
.dfl-file-session .dfl-group-rows { padding: 4px 6px 6px; }
.dfl-group-session-head {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  padding: 5px 10px 5px 14px;
  border: 0;
  background: transparent;
  color: var(--dfl-ink-2);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}
.dfl-group-session-head:hover { background: var(--dfl-hover); color: var(--dfl-ink); }
.dfl-group-session-name { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dfl-group-badge {
  font-size: 9px;
  font-weight: 600;
  padding: 0 4px;
  border-radius: 3px;
  background: color-mix(in srgb, #10b981 18%, transparent);
  color: #10b981;
  flex: none;
  line-height: 1.4;
}

/* ── Bottom Docked Composite Action Bar (Antigravity #compositeBar) ── */
.dfl-composite-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--dfl-border);
  background: var(--dfl-bg-card);
  flex: none;
}
.dfl-comp-left {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--dfl-ink-2);
}
.dfl-comp-count {
  font-size: 11.5px;
  color: var(--dfl-ink-2);
  font-variant-numeric: tabular-nums;
}
.dfl-comp-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; }
.dfl-comp-btn {
  height: 25px;
  padding: 0 8px;
  border-radius: 5px;
  border: 1px solid var(--dfl-border);
  background: var(--dfl-bg-fill);
  color: var(--dfl-ink);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  transition: background-color 0.12s ease;
}
.dfl-comp-btn:hover:not(:disabled) { background: var(--dfl-active); }
.dfl-comp-btn:disabled { opacity: 0.45; cursor: default; }
.dfl-comp-btn.is-primary {
  background: var(--dfl-ink);
  color: var(--dfl-bg-card);
  border-color: var(--dfl-ink);
}
.dfl-comp-btn.is-primary:hover:not(:disabled) { opacity: 0.9; }

.dfl-link {
  display: inline-flex; align-items: center; gap: 3px;
  border: 0; background: transparent; color: var(--dfl-accent);
  font: inherit; font-size: 11px; font-weight: 500; padding: 2px 4px; cursor: pointer; border-radius: 4px;
}
.dfl-link:hover { background: color-mix(in srgb, var(--dfl-accent) 9%, transparent); }
.dfl-button {
  height: 26px; padding: 0 10px; border-radius: 5px; border: 1px solid var(--dfl-border);
  background: var(--dfl-bg-card); color: var(--dfl-ink); font: inherit; font-size: 11.5px; font-weight: 500;
  cursor: pointer; display: inline-flex; align-items: center; gap: 4px;
  transition: background-color 120ms ease;
}
.dfl-button:hover:not(:disabled) { background: var(--dfl-hover); }
.dfl-button:disabled { opacity: 0.42; cursor: default; }
.dfl-button.is-primary { background: var(--dfl-accent); color: #fff; border-color: var(--dfl-accent); }
.dfl-button.is-primary:hover:not(:disabled) { filter: brightness(1.06); }
.dfl-button.is-danger { background: var(--dfl-danger); color: #fff; border-color: var(--dfl-danger); }
.dfl-button.is-danger:hover:not(:disabled) { filter: brightness(1.06); }

/* ── empty / loading / footer / toast ── */
.dfl-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 30px 20px; text-align: center; }
.dfl-empty-title { margin: 0; font-size: 12.5px; font-weight: 600; color: var(--dfl-ink-2); }
.dfl-empty-text { margin: 0; font-size: 11.5px; color: var(--dfl-ink-3); line-height: 1.5; max-width: 280px; }
.dfl-empty-actions { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.dfl-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--dfl-border); border-top-color: var(--dfl-accent); animation: dfl-spin 0.8s linear infinite; flex: none; }
.dfl-loading-card { gap: 8px; }
.dfl-loading-head { display: inline-flex; align-items: center; justify-content: center; gap: 8px; max-width: 300px; }
.dfl-loading-title { font-size: 12.5px; font-weight: 600; color: var(--dfl-ink-2); line-height: 1.45; }
.dfl-loading-track { width: 196px; height: 4px; border-radius: 999px; background: var(--dfl-border-soft); overflow: hidden; }
.dfl-loading-fill { height: 100%; border-radius: 999px; background: var(--dfl-accent); transition: width 240ms ease; }
.dfl-loading-eta { margin: 0; font-size: 11px; color: var(--dfl-accent); font-variant-numeric: tabular-nums; font-weight: 500; }
@keyframes dfl-spin { to { transform: rotate(360deg); } }
.dfl-foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 10px;
  border-top: 1px solid var(--dfl-border-soft);
  font-size: 10.5px;
  color: var(--dfl-ink-3);
  background: var(--dfl-bg-canvas);
}
.dfl-foot-count { flex: none; font-variant-numeric: tabular-nums; }
.dfl-foot-path { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; min-width: 0; }
.dfl-warning { padding: 6px 12px; font-size: 11px; color: var(--dfl-danger); border-top: 1px solid var(--dfl-border-soft); }
.dfl-toast {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 14px;
  z-index: 10010;
  padding: 6px 12px;
  border-radius: 6px;
  background: var(--dfl-ink);
  color: var(--dfl-bg-card);
  font-size: 11.5px;
  line-height: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);
  pointer-events: none;
  max-width: 90%;
  text-align: center;
}

/* ── frosted context menu ── */
.dfl-context-layer { position: fixed; inset: 0; z-index: 10002; }
.dfl-context-menu {
  position: fixed; z-index: 10003; overflow-y: auto; overscroll-behavior: contain;
  padding: 5px; border-radius: 12px; border: 0.5px solid var(--dfl-border);
  background: color-mix(in srgb, var(--dfl-bg-card) 95%, transparent);
  backdrop-filter: blur(14px); color: var(--dfl-ink);
  box-shadow: var(--dfl-popover-shadow); font-size: 12px; line-height: 18px;
}
.dfl-context-head { padding: 6px 8px 7px; border-bottom: 0.5px solid var(--dfl-border-soft); }
.dfl-context-head-row { display: flex; align-items: center; gap: 7px; min-width: 0; }
.dfl-context-head-meta { min-width: 0; flex: 1; }
.dfl-context-name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dfl-context-path { margin-top: 1px; font-size: 10px; color: var(--dfl-ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; }
.dfl-context-group { padding: 4px 0; border-top: 0.5px solid var(--dfl-border-soft); }
.dfl-context-group:first-of-type { border-top: 0; }
.dfl-context-label { padding: 3px 8px 2px; font-size: 10px; font-weight: 600; color: var(--dfl-ink-3); }
.dfl-context-note { padding: 3px 8px; font-size: 11px; color: var(--dfl-ink-3); }
.dfl-menu-item {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; padding: 6px 8px; border: 0; border-radius: 7px;
  background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.dfl-menu-item:hover, .dfl-menu-item:focus-visible { background: var(--dfl-hover); outline: none; }
.dfl-menu-item.is-danger { color: var(--dfl-danger); }
.dfl-menu-item.is-danger:hover { background: color-mix(in srgb, var(--dfl-danger) 10%, transparent); }
.dfl-context-danger { margin-top: 2px; }
.dfl-app-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dfl-app-default {
  flex: none; padding: 0 5px; border-radius: 4px;
  background: var(--dfl-bg-subtle); color: var(--dfl-ink-3); font-size: 10px; line-height: 16px;
}

/* ── structured confirm & trace modals ── */
.dfl-confirm-modal {
  position: fixed; inset: 0; z-index: 10004; display: flex; align-items: center; justify-content: center;
  padding: 20px; background: rgba(9, 11, 16, 0.54); backdrop-filter: blur(4px);
}
.dfl-confirm-card {
  width: min(410px, 92vw); overflow: hidden; border-radius: 13px;
  border: 0.5px solid var(--dfl-border); background: var(--dfl-bg-card);
  color: var(--dfl-ink); box-shadow: var(--dfl-popover-shadow);
  font-size: 12px; line-height: 19px;
}
.dfl-trace-card { width: min(540px, 94vw); padding: 16px; }
.dfl-modal-head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 12px 15px; border-bottom: 0.5px solid var(--dfl-border-soft);
}
.dfl-modal-title-wrap { display: flex; align-items: center; gap: 7px; min-width: 0; }
.dfl-modal-danger-icon {
  width: 24px; height: 24px; border-radius: 7px; flex: none;
  background: color-mix(in srgb, var(--dfl-danger) 12%, transparent);
  color: var(--dfl-danger); display: inline-grid; place-items: center;
}
.dfl-modal-close {
  width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent;
  color: var(--dfl-ink-3); cursor: pointer; display: grid; place-items: center;
}
.dfl-modal-close:hover { background: var(--dfl-hover); color: var(--dfl-ink); }
.dfl-modal-body { padding: 14px 15px; }
.dfl-confirm-title { font-size: 13.5px; font-weight: 600; }
.dfl-confirm-file-pill {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  border-radius: 8px; border: 0.5px solid var(--dfl-border-soft); background: var(--dfl-bg-canvas);
}
.dfl-confirm-file-info { min-width: 0; flex: 1; }
.dfl-confirm-name { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dfl-confirm-path { font-size: 10.5px; color: var(--dfl-ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; }
.dfl-confirm-text { margin: 10px 0 0; color: var(--dfl-ink-2); }
.dfl-confirm-warning {
  margin: 10px 0 0; padding: 8px 10px; border-radius: 8px;
  background: color-mix(in srgb, var(--dfl-warning) 10%, transparent);
  border: 0.5px solid color-mix(in srgb, var(--dfl-warning) 28%, transparent);
  color: var(--dfl-warning); font-size: 11.5px; line-height: 17px;
}
.dfl-confirm-actions {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 10px 15px; border-top: 0.5px solid var(--dfl-border-soft);
  background: var(--dfl-bg-canvas);
}
.dfl-trace-card .dfl-confirm-actions { background: transparent; padding: 12px 0 0; margin-top: 12px; }
.dfl-trace-path { margin-top: 6px; color: var(--dfl-ink-3); font-size: 11px; word-break: break-all; }
.dfl-trace-grid {
  display: flex; flex-direction: column; gap: 7px; margin-top: 12px; padding: 10px 12px;
  border-radius: 9px; border: 0.5px solid var(--dfl-border-soft); background: var(--dfl-bg-canvas);
}
.dfl-trace-row { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 10px; align-items: start; font-size: 11.5px; }
.dfl-trace-row > span { color: var(--dfl-ink-3); }
.dfl-trace-row > code { color: var(--dfl-ink-2); word-break: break-all; white-space: pre-wrap; max-height: 96px; overflow: auto; }

/* ── inline reader modal viewer ── */
.dfl-viewer-modal {
  position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center;
  padding: 20px; background: rgba(9, 11, 16, 0.62); backdrop-filter: blur(5px);
}
.dfl-viewer {
  width: min(1160px, 94vw); height: min(860px, 90vh); display: flex; flex-direction: column;
  overflow: hidden; border-radius: 14px; border: 0.5px solid var(--dfl-border);
  background: var(--dfl-bg-card); color: var(--dfl-ink);
  font-size: 13px; line-height: 20px; box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
}
.dfl-viewer-head {
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 9px 12px; border-bottom: 0.5px solid var(--dfl-border-soft);
  background: var(--dfl-bg-card);
}
.dfl-viewer-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dfl-viewer-name { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dfl-viewer-count {
  flex: none; padding: 0 6px; border-radius: 999px; background: var(--dfl-bg-subtle);
  font-size: 10.5px; color: var(--dfl-ink-3); font-variant-numeric: tabular-nums;
}
.dfl-viewer-actions { display: flex; align-items: center; gap: 6px; flex: none; }
.dfl-viewer-seg {
  display: inline-flex; align-items: center; padding: 2px; gap: 1px;
  border-radius: 8px; border: 0.5px solid var(--dfl-border-soft); background: var(--dfl-bg-subtle);
}
.dfl-viewer-button {
  width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent;
  color: var(--dfl-ink-2); font: inherit; font-size: 15px; line-height: 1; cursor: pointer;
  display: inline-grid; place-items: center;
}
.dfl-viewer-button:hover:not(:disabled) { background: var(--dfl-bg-card); color: var(--dfl-ink); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08); }
.dfl-viewer-button:disabled { opacity: 0.32; cursor: default; }
.dfl-viewer-button.is-close { width: 26px; height: 26px; border-radius: 7px; }
.dfl-viewer-button.is-close:hover { background: var(--dfl-hover); box-shadow: none; }
.dfl-viewer-toolbar {
  flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 12px;
  border-bottom: 0.5px solid var(--dfl-border-soft); background: var(--dfl-bg-canvas);
}
.dfl-viewer-pagecount { min-width: 56px; padding: 0 4px; text-align: center; color: var(--dfl-ink-2); font-size: 11px; font-variant-numeric: tabular-nums; }
.dfl-viewer-fit {
  height: 24px; padding: 0 8px; border: 0; border-radius: 6px;
  background: transparent; color: var(--dfl-ink-2);
  font: inherit; font-size: 11px; font-weight: 500; cursor: pointer; max-width: 110px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dfl-viewer-fit:hover { background: var(--dfl-bg-card); color: var(--dfl-ink); }
.dfl-viewer-fit[aria-pressed="true"] { background: var(--dfl-bg-card); color: var(--dfl-accent); font-weight: 600; }
.dfl-viewer-link {
  margin-left: auto; height: 26px; padding: 0 9px;
  border: 0.5px solid var(--dfl-border); border-radius: 7px;
  background: var(--dfl-bg-card); color: var(--dfl-ink-2);
  font: inherit; font-size: 11px; font-weight: 500; cursor: pointer;
  display: inline-flex; align-items: center; gap: 4px;
}
.dfl-viewer-link:hover { background: var(--dfl-hover); color: var(--dfl-ink); }
.dfl-viewer-note { color: var(--dfl-ink-3); font-size: 10.5px; white-space: nowrap; }
.dfl-viewer-body {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  overflow: auto; background: var(--dfl-bg-card); position: relative; z-index: 1;
}
.dfl-viewer-body.is-stage { background: var(--dfl-viewer-stage); }
.dfl-viewer-text-banner {
  flex: none; padding: 7px 14px; border-bottom: 0.5px solid var(--dfl-border-soft);
  background: var(--dfl-bg-canvas); color: var(--dfl-ink-2); font-size: 11px;
}
.dfl-pdf-scroll {
  width: 100%; height: 100%; overflow: auto; align-self: stretch;
  display: flex; flex-direction: column; align-items: center; gap: 16px;
  padding: 20px; box-sizing: border-box;
}
.dfl-pdf-page {
  flex: none; position: relative; background: #fff;
  border-radius: 6px; border: 0.5px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.14); overflow: hidden;
}
.dfl-pdf-page img { display: block; width: 100%; height: auto; }
.dfl-pdf-page-number {
  position: absolute; right: 10px; bottom: 10px; padding: 1px 6px; border-radius: 5px;
  background: rgba(15, 23, 42, 0.56); backdrop-filter: blur(4px);
  color: #fff; font-size: 10px; line-height: 16px; font-variant-numeric: tabular-nums;
}
.dfl-image-stage {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: 20px;
}
.dfl-viewer-image {
  max-width: 100%; max-height: 100%; object-fit: contain; display: block;
  border-radius: 8px; box-shadow: 0 12px 36px rgba(0, 0, 0, 0.24);
}
.dfl-viewer-text {
  margin: 0; padding: 16px 20px; width: 100%; height: 100%; overflow: auto; box-sizing: border-box;
  white-space: pre-wrap; word-break: break-word; font: 12.5px/19px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--dfl-ink);
}
.dfl-viewer-status {
  margin: auto; display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 28px 22px; text-align: center; color: var(--dfl-ink-2); font-size: 12px;
}
.dfl-viewer-status .dfl-empty-title { color: var(--dfl-ink); }
.dfl-viewer-status .dfl-empty-text { word-break: break-word; }
.dfl-office-help {
  max-width: 560px; margin-top: 6px; padding: 12px 14px; text-align: left;
  border: 0.5px solid var(--dfl-border-soft); border-radius: 10px; background: var(--dfl-bg-raised);
}
.dfl-office-help-title { margin: 0 0 6px; color: var(--dfl-ink); font-weight: 600; font-size: 13px; }
.dfl-office-help-text { margin: 0 0 6px; color: var(--dfl-ink-2); font-size: 11px; line-height: 1.5; }
.dfl-office-help-steps { margin: 6px 0 10px; padding-left: 18px; color: var(--dfl-ink-2); font-size: 11px; line-height: 1.65; }
.dfl-office-help-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dfl-office-help-actions .dfl-button { display: inline-flex; align-items: center; text-decoration: none; }
.dfl-office-help-hint { margin: 8px 0 0; color: var(--dfl-ink-3); font-size: 10px; }
.dfl-viewer-foot {
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 7px 12px; border-top: 0.5px solid var(--dfl-border-soft);
  background: var(--dfl-bg-canvas); font-size: 10.5px; color: var(--dfl-ink-3);
}
.dfl-viewer-hint { flex: none; white-space: nowrap; }
.dfl-viewer-path { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; min-width: 0; }

/* ── host header / composer / title entries ── */
.dfl-title-chip { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.dfl-header-entry {
  width: 26px; height: 26px; padding: 0; border: 0; border-radius: 7px;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.dfl-header-entry:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dfl-header-entry:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 1px; }
.dfl-composer-entry {
  height: 26px; max-width: 96px; padding: 0 8px; border: 0; border-radius: 999px;
  display: inline-flex; align-items: center; gap: 4px; background: transparent;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer;
}
.dfl-composer-entry:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dfl-composer-entry:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 1px; }
.dfl-composer-entry-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── card-based settings page ── */
.dfl-settings { max-width: 720px; color: var(--dfl-ink); font-size: 13px; line-height: 20px; }
.dfl-settings-heading h2 { margin: 0 0 3px; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
.dfl-settings-heading p { margin: 0 0 14px; color: var(--dfl-ink-3); font-size: 11.5px; }
.dfl-settings-card {
  margin-bottom: 12px; padding: 12px 15px; border: 0.5px solid var(--dfl-border);
  border-radius: 12px; background: var(--dfl-bg-card); box-shadow: var(--dfl-card-shadow);
}
.dfl-settings-card h3 {
  margin: 0 0 8px; font-size: 11.5px; font-weight: 600;
  color: var(--dfl-ink-3); text-transform: uppercase; letter-spacing: 0.03em;
}
.dfl-settings-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  min-height: 36px; padding: 6px 0; border-top: 0.5px solid var(--dfl-border-soft);
}
.dfl-settings-card h3 + .dfl-settings-row { border-top: 0; padding-top: 2px; }
.dfl-settings-label { display: flex; flex-direction: column; gap: 1px; font-size: 12.5px; font-weight: 500; }
.dfl-settings-hint { color: var(--dfl-ink-3); font-size: 11px; font-weight: 400; }
.dfl-settings-row input[type="number"], .dfl-settings-row select {
  width: 136px; height: 30px; padding: 0 8px; border: 0.5px solid var(--dfl-border);
  border-radius: 8px; background: var(--dfl-bg-canvas); color: var(--dfl-ink);
  font: inherit; font-size: 12px;
}
.dfl-settings-row input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--dfl-accent); }
.dfl-settings-text-wrap { display: flex; align-items: center; gap: 6px; flex: 1; max-width: 340px; }
.dfl-settings-text {
  flex: 1; min-width: 0; height: 30px; border-radius: 8px; border: 0.5px solid var(--dfl-border);
  background: var(--dfl-bg-canvas); color: var(--dfl-ink); font: inherit; font-size: 12px; padding: 0 9px;
}
.dfl-settings-clear {
  height: 30px; padding: 0 10px; border-radius: 8px; border: 0.5px solid var(--dfl-border);
  background: var(--dfl-bg-card); color: var(--dfl-ink-2); font: inherit; font-size: 11px; cursor: pointer;
}
.dfl-settings-clear:hover { background: var(--dfl-hover); color: var(--dfl-ink); }
.dfl-settings-path { display: flex; gap: 12px; padding: 4px 0; font-size: 11px; }
.dfl-settings-path span { flex: none; width: 92px; color: var(--dfl-ink-3); }
.dfl-settings-path code { min-width: 0; color: var(--dfl-ink-2); word-break: break-all; }
.dfl-settings-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.dfl-settings-status { margin-right: auto; color: var(--dfl-ink-3); font-size: 11px; }
.dfl-settings-save {
  height: 32px; padding: 0 16px; border: 0; border-radius: 8px;
  background: var(--dfl-accent); color: #fff; font: inherit; font-size: 12px; font-weight: 550; cursor: pointer;
}
.dfl-settings-save:hover:not(:disabled) { filter: brightness(1.06); }
.dfl-settings-save:disabled { opacity: 0.5; cursor: default; }
.dfl-settings-loading { display: flex; align-items: center; gap: 8px; padding: 20px; color: var(--dfl-ink-3); }
.dfl-settings .dfl-spinner { width: 14px; height: 14px; }
.dfl-settings-row.dfl-settings-theme-row { align-items: flex-start; }
.dfl-theme-picker {
  display: grid; grid-template-columns: repeat(2, minmax(84px, 1fr)); gap: 5px; width: 224px;
  padding: 4px; border-radius: 10px; background: var(--dfl-bg-subtle); border: 0.5px solid var(--dfl-border-soft);
}
.dfl-theme-option {
  height: 28px; padding: 0 8px; border: 0; border-radius: 7px;
  background: transparent; color: var(--dfl-ink-2);
  font: inherit; font-size: 11.5px; font-weight: 500; cursor: pointer;
  transition: background-color 120ms, color 120ms, box-shadow 120ms;
}
.dfl-theme-option:hover { background: var(--dfl-hover); color: var(--dfl-ink); }
.dfl-theme-option.is-active {
  color: var(--dfl-ink); background: var(--dfl-bg-card); font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 0 0 0.5px var(--dfl-border-soft);
}
.dfl-theme[data-dfl-scheme="dark"] .dfl-theme-option.is-active,
html[data-dfl-theme="dark"] .dfl-theme .dfl-theme-option.is-active { color: var(--dfl-ink); }
.dfl-theme[data-dfl-scheme="dark"] .dfl-filter-active-count,
html[data-dfl-theme="dark"] .dfl-theme .dfl-filter-active-count,
body[data-ds-dark-theme] .dfl-filter-active-count { color: #08111f; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-button.is-primary,
.dfl-theme[data-dfl-scheme="dark"] .dfl-settings-save,
html[data-dfl-theme="dark"] .dfl-theme .dfl-button.is-primary,
html[data-dfl-theme="dark"] .dfl-theme .dfl-settings-save,
body[data-ds-dark-theme] .dfl-button.is-primary,
body[data-ds-dark-theme] .dfl-settings-save { background: #2563eb; color: #fff; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-button.is-danger,
html[data-dfl-theme="dark"] .dfl-theme .dfl-button.is-danger,
body[data-ds-dark-theme] .dfl-button.is-danger { background: #dc2626; color: #fff; }

@media (max-width: 390px) {
  .dfl-row-act-btn { padding: 0 5px; font-size: 10.5px; }
  .dfl-open-button { padding: 0 6px; font-size: 10.5px; }
}
@media (prefers-reduced-motion: reduce) { .dfl-spinner, .dfl-refresh-btn.is-loading svg { animation-duration: 2.4s; } }
`

    return {
      inject,
      apply,
      __internals: {
        NS, KIND, ID, CSS, zh, en,
        CATEGORY_ORDER,
        fileAddressFor, referenceText, categoryOf, extensionLabel,
        isReadableFile, fileRowKey, isImageFile, canPanelPreview, themeAttributes, EXTENSION_CATEGORY,
        readLocalAppearance, writeLocalAppearance, applyDocumentTheme,
      },
    }
  },
})
