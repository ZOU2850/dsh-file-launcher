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

    const SOURCE_LABELS = {
      delivered: 'source.delivered',
      written: 'source.written',
      edited: 'source.edited',
      attachment: 'source.attachment',
      read: 'source.read',
      workspace: 'source.workspace',
      pinned: 'source.pinned',
    }

    const EXTENSION_CATEGORY = {
      doc: 'document', docx: 'document', odt: 'document', rtf: 'document', pages: 'document', wps: 'document',
      ppt: 'slides', pptx: 'slides', odp: 'slides', key: 'slides', dps: 'slides',
      xls: 'sheets', xlsx: 'sheets', xlsm: 'sheets', csv: 'sheets', tsv: 'sheets', ods: 'sheets', et: 'sheets',
      pdf: 'pdf',
      md: 'markdown', markdown: 'markdown', mdx: 'markdown',
      txt: 'text', log: 'text', json: 'text', jsonl: 'text', yaml: 'text', yml: 'text', toml: 'text',
      ini: 'text', cfg: 'text', conf: 'text', xml: 'text', env: 'text',
      png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image',
      ico: 'image', tif: 'image', tiff: 'image', avif: 'image',
      html: 'web', htm: 'web', css: 'web', scss: 'web', less: 'web', vue: 'web', svelte: 'web', astro: 'web',
      js: 'code', mjs: 'code', cjs: 'code', ts: 'code', tsx: 'code', jsx: 'code', py: 'code', ps1: 'code',
      psm1: 'code', sh: 'code', bash: 'code', zsh: 'code', bat: 'code', cmd: 'code', java: 'code', kt: 'code',
      kts: 'code', go: 'code', rs: 'code', c: 'code', h: 'code', cc: 'code', cpp: 'code', hpp: 'code',
      cs: 'code', rb: 'code', php: 'code', swift: 'code', lua: 'code', r: 'code', scala: 'code', sql: 'code',
      dart: 'code', ex: 'code', exs: 'code', erl: 'code', hs: 'code', clj: 'code', gradle: 'code',
      make: 'code', dockerfile: 'code',
      mp4: 'media', mov: 'media', mkv: 'media', avi: 'media', webm: 'media', mp3: 'media', wav: 'media',
      flac: 'media', m4a: 'media', ogg: 'media', aac: 'media',
      zip: 'archive', '7z': 'archive', rar: 'archive', tar: 'archive', gz: 'archive', tgz: 'archive',
      bz2: 'archive', xz: 'archive',
      psd: 'design', ai: 'design', sketch: 'design', fig: 'design', xd: 'design', dwg: 'design', dxf: 'design',
      blend: 'design', obj: 'design', stl: 'design', '3ds': 'design', indd: 'design', afdesign: 'design',
      exe: 'executable', msi: 'executable', msix: 'executable', appx: 'executable', app: 'executable',
      dmg: 'executable', deb: 'executable', rpm: 'executable', apk: 'executable',
      db: 'database', sqlite: 'database', sqlite3: 'database', mdb: 'database', accdb: 'database', dbf: 'database',
      ttf: 'font', otf: 'font', woff: 'font', woff2: 'font', eot: 'font',
      iso: 'disk', img: 'disk', vhd: 'disk', vhdx: 'disk', vmdk: 'disk',
      bin: 'binary', dat: 'binary', pak: 'binary', wasm: 'binary', dll: 'binary', so: 'binary', dylib: 'binary',
    }

    /** Lowercase extension without the dot. */
    function extensionOf(name) {
      const text = String(name || '')
      const base = text.slice(Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\')) + 1)
      const dot = base.lastIndexOf('.')
      return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1).toLowerCase() : ''
    }

    /** UI category of a file name or path. */
    function categoryOf(name) {
      return EXTENSION_CATEGORY[extensionOf(name)] || 'other'
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

    /** Composer reference text for one file. */
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
      const now = new Date()
      const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
      if (sameDay) return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      return `${date.getMonth() + 1}-${date.getDate()}`
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
        d: 'M3.5 6.5A2.5 2.5 0 0 1 6 4h3.2c.7 0 1.4.3 1.9.9l1 1.1H18a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5v-10Z',
        fill: 'currentColor', opacity: 0.9,
      }),
      h('path', {
        d: 'M9.2 13.1h5.6m-2.4-2.4 2.4 2.4-2.4 2.4',
        fill: 'none', stroke: 'var(--dsw-alias-bg-base)', strokeWidth: 1.6,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }))
    }

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
        const [preferences, setPreferences] = useState(null)
        const scheme = useResolvedScheme(preferences?.appearanceTheme || 'host')
        const scopeTouched = useRef(false)
        const [historyId, setHistoryId] = useState(null)
        const [historySessions, setHistorySessions] = useState([])
        const [data, setData] = useState(null)
        const [pins, setPins] = useState([])
        const [pinsError, setPinsError] = useState('')
        const [health, setHealth] = useState(null)
        const [desktop, setDesktop] = useState(null)
        const [loading, setLoading] = useState(false)
        const [error, setError] = useState('')
        const [query, setQuery] = useState('')
        const [category, setCategory] = useState('all')
        const [sort, setSort] = useState('time')
        const [selectMode, setSelectMode] = useState(false)
        const [selected, setSelected] = useState(() => new Set())
        const [contextMenu, setContextMenu] = useState(null)
        const [pendingDelete, setPendingDelete] = useState(null)
        const [filterMenu, setFilterMenu] = useState(null)
        const contextMenuRef = useRef(null)

        useEffect(() => {
          if (contextMenu === null) return
          const node = contextMenuRef.current
          if (node === null) return
          const first = node.querySelector('.dfl-menu-item')
          if (first !== null) first.focus()
        }, [contextMenu])

        useEffect(() => {
          if (filterMenu === null) return
          const dismiss = (event) => {
            const target = event.target
            if (target instanceof Element && (target.closest('.dfl-filter-popover') !== null || target.closest('.dfl-filter-trigger') !== null)) return
            setFilterMenu(null)
          }
          const onKey = (event) => { if (event.key === 'Escape') setFilterMenu(null) }
          document.addEventListener('mousedown', dismiss)
          document.addEventListener('keydown', onKey)
          return () => {
            document.removeEventListener('mousedown', dismiss)
            document.removeEventListener('keydown', onKey)
          }
        }, [filterMenu])
        const [sourceFilter, setSourceFilter] = useState('all')
        const [archivedOnly, setArchivedOnly] = useState(false)
        const [expandedProjects, setExpandedProjects] = useState(() => new Map())
        const [expandedSessions, setExpandedSessions] = useState(() => new Map())
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

        const inventorySessionId = scope === 'history' ? historyId : sessionId
        const historyRow = useMemo(() => {
          if (historyId === null) return undefined
          return sessions.find(row => row.id === historyId)
            || historySessions.find(row => row.id === historyId)
        }, [historyId, sessions, historySessions])
        const inventoryCwd = scope === 'history'
          ? (historyRow && historyRow.cwd ? historyRow.cwd : undefined)
          : cwd
        const inventoryTitle = scope === 'sent'
          ? t('scope.sentTitle')
          : scope === 'history' && historyRow
            ? (historyRow.displayTitle || historyRow.title || historyId)
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

        /* Host session fallback for the history chooser. */
        useEffect(() => {
          if (scope !== 'history' || sessions.length > 0) return undefined
          let alive = true
          api('/api/file-launcher.sessions?limit=60')
            .then(value => { if (alive && Array.isArray(value.sessions)) setHistorySessions(value.sessions) })
            .catch(() => {})
          return () => { alive = false }
        }, [scope, sessions.length])

        /* Inventory for the current conversation, project, or chosen history row. */
        useEffect(() => {
          if (scope === 'pins' || scope === 'history' && historyId === null) {
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
          const cached = dataCache.current.get(cacheKey)
          if (!live && cached !== undefined && Date.now() - cached.at < 30_000) {
            setData(cached.value)
            setError('')
            setLoading(false)
            return undefined
          }
          let alive = true
          const controller = new AbortController()
          setLoading(true)
          setError('')
          const parameters = new URLSearchParams({
            sessionId: inventorySessionId,
            scope: inventoryScope,
            limit: String(preferences?.maxRows || 800),
          })
          // Only an explicit user refresh forces a full host rescan; the
          // auto-refresh timer reuses the host's short-lived scan cache so a
          // huge Session log is never re-read every tick.
          if (manual) parameters.set('fresh', '1')
          api(`/api/file-launcher.inventory?${parameters.toString()}`, { signal: controller.signal })
            .then(value => {
              if (!alive) return
              dataCache.current.set(cacheKey, { at: Date.now(), value })
              // Bound the cache: each entry holds a full inventory payload.
              while (dataCache.current.size > 24) {
                const oldest = dataCache.current.keys().next().value
                dataCache.current.delete(oldest)
              }
              setData(value)
              if (!live) setSelected(new Set())
            })
            .catch(caught => {
              if (!alive || live) return
              setData(null)
              setError(caught instanceof Error ? caught.message : String(caught))
            })
            .finally(() => { if (alive) setLoading(false) })
          return () => { alive = false; controller.abort() }
        }, [scope, historyId, inventorySessionId, inventoryScope, refreshKey, liveTick, preferences?.maxRows])

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
          if (scope === 'pins' || (scope === 'history' && historyId === null)) return undefined
          const seconds = preferences && preferences.autoRefresh === false ? 0 : preferences ? preferences.refreshSeconds : 60
          if (seconds <= 0) return undefined
          const timer = setInterval(() => {
            setLiveTick(value => value + 1)
          }, seconds * 1000)
          return () => clearInterval(timer)
        }, [scope, historyId, viewer, preferences])

        /* Toast lifetime. */
        useEffect(() => {
          if (toast === null) return undefined
          const timer = setTimeout(() => setToast(null), 3200)
          return () => clearTimeout(timer)
        }, [toast])

        /* Reset the drill-down when the Session changes. */
        useEffect(() => {
          setHistoryId(null)
          setData(null)
          setSelected(new Set())
          setViewer(null)
          setViewerState({ status: 'idle' })
          setContextMenu(null)
          setPendingDelete(null)
          setFilterMenu(null)
        }, [sessionId])

        /* Pin lookup. */
        const pinKeys = useMemo(() => new Set(pins.map(pin => pathKey(pin.path))), [pins])

        /* The panel's raw rows. */
        const pinRows = useMemo(() => pins.map(pin => {
          const name = pin.name || baseName(pin.path)
          const rowCwd = pin.cwd || cwd
          return {
            path: pin.path,
            name,
            rel: relativeOf(pin.path, rowCwd),
            category: categoryOf(name || pin.path),
            source: 'pinned',
            description: pin.description,
            sessionId: pin.sessionId,
            cwd: pin.cwd || cwd,
            mtime: pin.addedAt,
            addedAt: pin.addedAt,
          }
        }), [pins, cwd])

        const currentData = data && data.scope === inventoryScope
          && (inventoryScope === 'sent' || data.sessionId === inventorySessionId) ? data : null
        const baseFiles = scope === 'pins' ? pinRows : (currentData ? currentData.files : [])

        const matchesQuery = (file) => {
          const needle = query.trim().toLowerCase()
          return needle.length === 0
            || `${file.name} ${file.rel} ${file.path} ${file.description || ''}`.toLowerCase().includes(needle)
        }

        const categoryCounts = useMemo(() => {
          const counts = {}
          let total = 0
          for (const file of baseFiles) {
            if (!matchesQuery(file)) continue
            if (sourceFilter !== 'all' && file.source !== sourceFilter) continue
            if (archivedOnly && file.archived !== true) continue
            counts[file.category] = (counts[file.category] || 0) + 1
            total += 1
          }
          return { counts, total }
        }, [baseFiles, query, sourceFilter, archivedOnly])

        const sourceCounts = useMemo(() => {
          const counts = {}
          let total = 0
          for (const file of baseFiles) {
            if (!matchesQuery(file)) continue
            if (archivedOnly && file.archived !== true) continue
            counts[file.source] = (counts[file.source] || 0) + 1
            total += 1
          }
          return { counts, total }
        }, [baseFiles, query, archivedOnly])

        const archivedCount = useMemo(() => {
          let total = 0
          for (const file of baseFiles) {
            if (file.archived !== true) continue
            if (!matchesQuery(file)) continue
            if (category !== 'all' && file.category !== category) continue
            if (sourceFilter !== 'all' && file.source !== sourceFilter) continue
            total += 1
          }
          return total
        }, [baseFiles, query, category, sourceFilter])

        const visibleFiles = useMemo(() => {
          let rows = baseFiles.slice()
          const needle = query.trim().toLowerCase()
          if (needle.length > 0) {
            rows = rows.filter(file => `${file.name} ${file.rel} ${file.path} ${file.description || ''}`.toLowerCase().includes(needle))
          }
          if (category !== 'all') rows = rows.filter(file => file.category === category)
          if (sourceFilter !== 'all') rows = rows.filter(file => file.source === sourceFilter)
          if (archivedOnly) rows = rows.filter(file => file.archived === true)
          rows.sort((left, right) => {
            if (sort === 'name') return String(left.name).localeCompare(String(right.name), undefined, { sensitivity: 'base' })
            if (sort === 'type') {
              const byType = String(left.category).localeCompare(String(right.category))
              if (byType !== 0) return byType
              return String(left.name).localeCompare(String(right.name), undefined, { sensitivity: 'base' })
            }
            return (right.mtime || right.addedAt || 0) - (left.mtime || left.addedAt || 0)
          })
          return rows
        }, [baseFiles, query, category, sort, sourceFilter, archivedOnly])

        const fileGroups = useMemo(() => {
          if (scope !== 'sent' && scope !== 'project') return null
          const projects = new Map()
          for (const file of visibleFiles) {
            const projectPath = file.cwd || inventoryCwd || file.projectName || ''
            const projectKey = projectPath ? pathKey(projectPath) : '__unknown__'
            let project = projects.get(projectKey)
            if (project === undefined) {
              project = {
                key: projectKey,
                name: file.projectName || baseName(projectPath) || t('group.unknown'),
                path: projectPath,
                files: 0,
                sessions: new Map(),
              }
              projects.set(projectKey, project)
            }
            const isWorkspace = file.source === 'workspace'
            const sessionKey = isWorkspace ? 'workspace' : (file.sessionId || 'session')
            let session = project.sessions.get(sessionKey)
            if (session === undefined) {
              session = {
                key: sessionKey,
                name: isWorkspace
                  ? t('group.workspace')
                  : file.sessionTitle
                    || (file.sessionId === inventorySessionId ? sessionTitle : undefined)
                    || t('group.untitled'),
                files: [],
              }
              project.sessions.set(sessionKey, session)
            }
            session.files.push(file)
            project.files += 1
          }
          return [...projects.values()].map(project => ({ ...project, sessions: [...project.sessions.values()] }))
        }, [visibleFiles, scope, inventoryCwd, inventorySessionId, sessionTitle, t])

        const selectedFiles = useMemo(
          () => baseFiles.filter(file => selected.has(fileRowKey(file))),
          [baseFiles, selected],
        )

        /* List of history sessions to draw in the chooser. */
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
          let rows = [...merged.values()].filter(row => row.id !== sessionId)
          const needle = query.trim().toLowerCase()
          if (needle.length > 0) {
            rows = rows.filter(row => `${row.displayTitle} ${row.cwd || ''}`.toLowerCase().includes(needle))
          }
          return rows.sort((left, right) => right.updatedAt - left.updatedAt)
        }, [historySessions, sessions, sessionId, query])

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
          setViewerState({
            status: 'pages',
            file,
            pages: result.pages,
            totalPages: result.totalPages || result.pages.length,
            truncated: result.truncated === true,
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
          const controller = new AbortController()
          let objectUrl
          const sourceSession = file.sessionId || inventorySessionId || sessionId
          const sourcePath = file.previewPath || file.path
          setViewerState({ status: 'loading', file })
          void (async () => {
            try {
              if (isOfficeFile(file)) {
                const officeKit = officeKitRef?.value || (ctx.remote && ctx.remote.officeKit)
                if (officeKit === undefined) throw new Error(t('viewer.officeUnavailable'))
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
        }, [viewer, ctx, inventorySessionId, sessionId, t, renderPdfPages])

        useEffect(() => {
          if (viewer === null) return undefined
          const onKey = (event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              if (contextMenu !== null) {
                setContextMenu(null)
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
        }, [viewer, moveViewer, goViewerPage, viewerState.status, contextMenu])

        const loadApps = useCallback(async (file) => {
          if (!file || typeof file.path !== 'string') return
          const key = file.path
          const cached = appCache.current[key]
          if (cached && (cached.loading || cached.loaded)) return
          appCache.current[key] = { loading: true, loaded: false, list: [] }
          setAppRevision(value => value + 1)
          try {
            const result = await ctx.remote.session.workspacePathApplications({ path: file.path })
            appCache.current[key] = {
              loading: false,
              loaded: true,
              list: result.ok === true && Array.isArray(result.value) ? result.value : [],
              ...(result.ok === true ? {} : { error: result.error && result.error.message }),
            }
          } catch (caught) {
            appCache.current[key] = { loading: false, loaded: true, list: [], error: caught instanceof Error ? caught.message : String(caught) }
          }
          setAppRevision(value => value + 1)
        }, [])

        const openNative = useCallback(async (file, application) => {
          try {
            const request = { path: file.path, ...(application ? { application } : {}) }
            const result = await ctx.remote.session.openWorkspacePath(request)
            if (result.ok === true) notify(t('toast.opened'))
            else notify(t('toast.failed', { message: result.error ? result.error.message : 'open failed' }))
          } catch (caught) {
            notify(t('toast.failed', { message: caught instanceof Error ? caught.message : String(caught) }))
          }
        }, [ctx, notify, t])

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
              const span = inputActions.captureInsertion()
              if (inputActions.insertText(text, span)) {
                if (!quiet) notify(t('toast.added'))
                return 'inserted'
              }
            } catch {
              // Composer unavailable; copy instead.
            }
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
          ['session', 'scope.session'],
          ['sent', 'scope.sent'],
          ['project', 'scope.project'],
          ['pins', 'scope.pins'],
          ['history', 'scope.history'],
        ]

        const categories = ['all', 'document', 'slides', 'sheets', 'pdf', 'markdown', 'text', 'image', 'web', 'code', 'media', 'archive', 'design', 'executable', 'database', 'font', 'disk', 'binary', 'folder', 'other']
          .filter(key => key === 'all' || (categoryCounts.counts[key] || 0) > 0 || key === category)

        const sources = ['all', 'delivered', 'attachment', 'written', 'edited', 'read', 'workspace', 'pinned']
          .filter(key => key === 'all' || (sourceCounts.counts[key] || 0) > 0 || key === sourceFilter)

        function renderScopeTabs() {
          return h('div', { className: 'dfl-scopes', role: 'tablist', 'aria-label': t('scope.label') },
            scopes.map(([value, label]) => h('button', {
              key: value,
              type: 'button',
              className: 'dfl-scope',
              role: 'tab',
              'aria-selected': scope === value,
              'aria-pressed': scope === value,
              onClick: () => {
                scopeTouched.current = true
                setScope(value)
                setContextMenu(null)
                setQuery('')
                setCategory('all')
                setSourceFilter('all')
                setArchivedOnly(false)
                setFilterMenu(null)
                setSelected(new Set())
                if (value !== 'history') setHistoryId(null)
              },
            }, t(label))))
        }

        function renderHeader() {
          return h('div', { className: 'dfl-head' },
            h('div', { className: 'dfl-title-row' },
              h('div', { className: 'dfl-title' },
                scope === 'history' && historyId !== null ? h('button', {
                  type: 'button', className: 'dfl-head-back',
                  title: t('history.back'), 'aria-label': t('history.back'),
                  onClick: () => {
                    setHistoryId(null)
                    setData(null)
                    setQuery('')
                    setCategory('all')
                    setSourceFilter('all')
                    setArchivedOnly(false)
                    setFilterMenu(null)
                  },
                }, '←') : null,
                h(LauncherGlyph, { size: 17 }),
                h('span', { className: 'dfl-title-text' }, t('type.label'))),
              h('div', { className: 'dfl-head-actions' },
                h('button', {
                  type: 'button', className: 'dfl-tool', title: t('action.refresh'), 'aria-label': t('action.refresh'),
                  onClick: refresh,
                }, '⟳'),
                h('button', {
                  type: 'button',
                  className: `dfl-tool dfl-select-toggle${selectMode ? ' is-on' : ''}`,
                  title: selectMode ? t('action.done') : t('action.select'),
                  'aria-pressed': selectMode,
                  onClick: () => { setSelectMode(value => !value); setSelected(new Set()); setContextMenu(null) },
                }, selectMode ? t('action.done') : t('action.select')))),
            h('div', { className: 'dfl-subtitle', title: inventoryCwd || '' },
              h('span', { className: 'dfl-subtitle-title' }, inventoryTitle),
              inventoryCwd && scope !== 'sent' ? h('span', { className: 'dfl-subtitle-path' }, inventoryCwd) : null),
          )
        }

        function renderToolbar() {
          const showFilters = scope !== 'history' || historyId !== null
          const activeCount = (category !== 'all' ? 1 : 0) + (sourceFilter !== 'all' ? 1 : 0) + (archivedOnly ? 1 : 0)
          const hasActiveFilters = activeCount > 0

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
          isOn ? h('span', { className: 'dfl-filter-check', 'aria-hidden': true }, '✓') : null)

          const activeTag = (key, label, clear) => h('span', { key, className: 'dfl-filter-tag' },
            h('span', { className: 'dfl-filter-tag-label' }, label),
            h('button', {
              type: 'button', className: 'dfl-filter-tag-clear',
              'aria-label': t('filter.clear'), title: t('filter.clear'),
              onClick: clear,
            }, '×'))

          const filterPanel = () => filterMenu !== 'panel' ? null : h('div', {
            className: 'dfl-filter-popover dfl-filter-panel',
            role: 'menu',
          },
          h('div', { className: 'dfl-filter-panel-head' },
            h('span', { className: 'dfl-filter-panel-title' }, t('filter.title')),
            hasActiveFilters ? h('button', {
              type: 'button', className: 'dfl-filter-clear',
              onClick: () => { setCategory('all'); setSourceFilter('all'); setArchivedOnly(false) },
            }, t('filter.clearAll')) : null),
          h('div', { className: 'dfl-filter-column' },
            h('div', { className: 'dfl-filter-section-title' }, t('filter.sourceSection')),
            sources.map(key => filterOption('source', key, key === 'all' ? t('filter.sourceAll') : t(SOURCE_LABELS[key]), key === 'all' ? sourceCounts.total : sourceCounts.counts[key] || 0, sourceFilter === key))),
          h('div', { className: 'dfl-filter-column is-child' },
            h('div', { className: 'dfl-filter-section-title dfl-filter-child-title' },
              h('span', null, t('filter.typeSection')),
              h('span', { className: 'dfl-filter-parent' }, sourceFilter === 'all' ? t('filter.withinAllSources') : t('filter.within', { value: t(SOURCE_LABELS[sourceFilter]) }))),
            categories.map(key => filterOption('category', key, key === 'all' ? t('filter.typeAll') : t(CATEGORY_LABELS[key]), key === 'all' ? categoryCounts.total : categoryCounts.counts[key] || 0, category === key))))

          return h('div', { className: 'dfl-toolbar' },
            h('div', { className: 'dfl-search-row' },
              h('input', {
                className: 'dfl-search',
                type: 'search',
                value: query,
                placeholder: scope === 'history' && historyId === null ? t('history.search') : t('search.placeholder'),
                'aria-label': scope === 'history' && historyId === null ? t('history.search') : t('search.placeholder'),
                onChange: event => setQuery(event.target.value),
              }),
              scope === 'history' && historyId === null ? null : h('select', {
                className: 'dfl-sort',
                value: sort,
                'aria-label': t('sort.label'),
                onChange: event => setSort(event.target.value),
              },
              h('option', { value: 'time' }, t('sort.time')),
              h('option', { value: 'name' }, t('sort.name')),
              h('option', { value: 'type' }, t('sort.type'))),
            ),
            showFilters ? h('div', { className: 'dfl-filterbar' },
              h('button', {
                type: 'button',
                className: `dfl-filter-trigger dfl-filter-button${hasActiveFilters ? ' is-on' : ''}${filterMenu === 'panel' ? ' is-open' : ''}`,
                'aria-expanded': filterMenu === 'panel',
                'aria-haspopup': 'menu',
                onClick: () => setFilterMenu(filterMenu === 'panel' ? null : 'panel'),
              },
              h('span', { className: 'dfl-filter-button-text' }, t('filter.button')),
              activeCount > 0 ? h('span', { className: 'dfl-filter-active-count' }, activeCount) : null,
              h('span', { className: 'dfl-chevron' }, '▾')),
              category !== 'all' ? activeTag('type', `${t('filter.typeLabel')} · ${t(CATEGORY_LABELS[category])}`, () => setCategory('all')) : null,
              sourceFilter !== 'all' ? activeTag('source', `${t('filter.sourceKey')} · ${t(SOURCE_LABELS[sourceFilter])}`, () => setSourceFilter('all')) : null,
              archivedCount > 0 || archivedOnly ? h('button', {
                type: 'button',
                className: `dfl-filter-trigger dfl-archived-toggle${archivedOnly ? ' is-on' : ''}`,
                'aria-pressed': archivedOnly,
                onClick: () => setArchivedOnly(value => !value),
              },
              h('span', { className: 'dfl-filter-key' }, t('filter.archived')),
              h('span', { className: 'dfl-filter-count' }, archivedCount)) : null,
              h('span', { className: 'dfl-filter-total' }, t('filter.files', { count: visibleFiles.length })),
              filterPanel()) : null,
          )
        }

        function renderSelectionBar() {
          if (!selectMode) return null
          const count = selectedFiles.length
          return h('div', { className: 'dfl-selectbar' },
            h('span', { className: 'dfl-select-count' }, t('select.count', { count })),
            h('button', { type: 'button', className: 'dfl-link', onClick: selectAll }, t('select.all')),
            h('button', { type: 'button', className: 'dfl-link', onClick: clearSelection }, t('select.clear')),
            h('span', { className: 'dfl-spacer' }),
            h('button', {
              type: 'button', className: 'dfl-button', disabled: count === 0,
              onClick: () => attachToComposer(selectedFiles),
            }, t('action.addToInput')),
            h('button', {
              type: 'button', className: 'dfl-button', disabled: count === 0,
              onClick: () => addPins(selectedFiles),
            }, t('action.pin')),
            h('button', {
              type: 'button', className: 'dfl-button', disabled: count === 0 || archiving,
              onClick: () => archiveFiles(selectedFiles),
            }, archiving ? t('toast.archiving') : t('action.archive')),
          )
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
          const context = scope === 'sent'
            ? [file.projectName, file.sessionTitle].filter(Boolean).join(' · ')
            : ''
          const meta = [
            context,
            file.rel && file.rel !== file.name ? file.rel : '',
            typeof file.size === 'number' && file.size > 0 ? formatBytes(file.size) : '',
            file.source !== 'pinned' ? formatTime(file.mtime) : '',
          ].filter(Boolean).join(' · ')
          const openThis = () => {
            if (file.missing === true) { notify(t('toast.missing')); return }
            if (file.isFolder === true) { void openFolder(file); return }
            if (previewable) openViewer(file)
            else preview(file)
          }
          return h('div', { key: rowKey, className: 'dfl-item' },
            h('div', {
              className: `dfl-row${selectedNow ? ' is-selected' : ''}${isMenuOpen ? ' is-open' : ''}${file.missing === true ? ' is-missing' : ''}`,
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
            selectMode ? h('input', {
              type: 'checkbox',
              className: 'dfl-check',
              checked: selectedNow,
              'aria-label': t('select.row', { name: file.name }),
              onClick: event => event.stopPropagation(),
              onChange: event => toggleSelected(rowKey, event.target.checked),
            }) : null,
            h('div', { className: 'dfl-icon', 'data-cat': file.category }, extensionLabel(file.name)),
            h('div', { className: 'dfl-main' },
              h('div', { className: 'dfl-name-line' },
                h('span', { className: 'dfl-name' }, file.name),
                file.source === 'delivered' ? h('span', { className: 'dfl-badge is-delivered' }, t('source.delivered')) : null,
                file.isFolder === true ? h('span', { className: 'dfl-badge is-folder' }, t('filter.folder')) : null,
                file.missing === true ? h('span', { className: 'dfl-badge is-missing' }, t('source.missing')) : null,
                file.moved === true ? h('span', { className: 'dfl-badge is-moved' }, t('source.moved')) : null,
                file.source === 'attachment' ? h('span', { className: 'dfl-badge is-user' }, t('source.attachment')) : null,
                file.archived === true ? h('span', { className: 'dfl-badge is-archived' }, t('source.archived')) : null,
                pinned ? h('span', { className: 'dfl-badge is-pinned' }, t('source.pinned')) : null),
              h('div', { className: 'dfl-meta' },
                h('span', { className: 'dfl-meta-text' }, meta || t('source.' + file.source)),
                file.description ? h('span', { className: 'dfl-desc' }, ` · ${file.description}`) : null)),
            h('div', { className: 'dfl-row-actions' },
              h('button', {
                type: 'button', className: 'dfl-icon-button',
                title: file.isFolder === true ? t('action.folder') : previewable ? t('action.previewInline') : t('action.preview'),
                'aria-label': file.isFolder === true ? t('action.folder') : previewable ? t('action.previewInline') : t('action.preview'),
                onClick: event => { event.stopPropagation(); openThis() },
              }, '↗'),
              h('button', {
                type: 'button', className: 'dfl-open-button',
                title: t('action.menu'), 'aria-label': t('action.menu'),
                'aria-expanded': isMenuOpen,
                onClick: event => openContextMenu(file, event),
              }, h('span', null, t('action.menu')), h('span', { className: 'dfl-chevron' }, '▾')))),
            null)
        }

        function renderFileList() {
          if (loading && baseFiles.length === 0) {
            return h('div', { className: 'dfl-empty', role: 'status' }, h('span', { className: 'dfl-spinner', 'aria-hidden': true }), t('loading'))
          }
          if (error) {
            return h('div', { className: 'dfl-empty' },
              h('p', { className: 'dfl-empty-title' }, t('error.title')),
              h('p', { className: 'dfl-empty-text' }, error),
              h('button', { type: 'button', className: 'dfl-button', onClick: refresh }, t('error.retry')))
          }
          if (visibleFiles.length === 0) {
            const key = query.trim().length > 0 || category !== 'all' || sourceFilter !== 'all' || archivedOnly
              ? 'empty.filtered'
              : scope === 'pins' ? 'empty.pins' : scope === 'sent' ? 'empty.sent' : scope === 'project' ? 'empty.project' : 'empty.session'
            return h('div', { className: 'dfl-empty' },
              h('p', { className: 'dfl-empty-title' }, t('empty.title')),
              h('p', { className: 'dfl-empty-text' }, t(key)))
          }
          const forceOpenGroups = query.trim().length > 0 || category !== 'all' || sourceFilter !== 'all' || archivedOnly
          if (fileGroups !== null) {
            const renderSessionGroup = (projectKey, session, singleSession) => {
              const sessionKey = `${projectKey}:session:${session.key}`
              const sessionOpen = expandedSessions.get(sessionKey) ?? (
                forceOpenGroups
                || preferences?.collapseGroups === false
                || (scope === 'project' && singleSession)
              )
              return h('div', { key: sessionKey, className: 'dfl-file-session' },
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
                h('span', { className: 'dfl-group-chevron', 'aria-hidden': true }, sessionOpen ? '▾' : '▸'),
                h('span', { className: 'dfl-group-session-name' }, session.name),
                h('span', { className: 'dfl-group-count' }, `${session.files.length}`)),
                sessionOpen ? session.files.map(renderRow) : null)
            }
            if (scope === 'project' && fileGroups.length === 1) {
              const onlyProject = fileGroups[0]
              const projectKey = `files:project:${onlyProject.key}`
              const singleSession = onlyProject.sessions.length === 1
              return h('div', { className: 'dfl-list dfl-grouped-list' },
                onlyProject.sessions.map(session => renderSessionGroup(projectKey, session, singleSession)))
            }
            return h('div', { className: 'dfl-list dfl-grouped-list' }, fileGroups.map(project => {
              const projectKey = `files:project:${project.key}`
              const projectOpen = expandedProjects.get(projectKey) ?? (
                forceOpenGroups
                || preferences?.collapseGroups === false
                || scope === 'project'
              )
              const singleSession = project.sessions.length === 1
              return h('div', { key: projectKey, className: 'dfl-file-group' },
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
                h('span', { className: 'dfl-group-chevron', 'aria-hidden': true }, projectOpen ? '▾' : '▸'),
                h('span', { className: 'dfl-group-name' }, project.name),
                h('span', { className: 'dfl-group-count' }, `${project.files}`),
                h('span', { className: 'dfl-group-path', title: project.path }, project.path)),
                projectOpen ? project.sessions.map(session => renderSessionGroup(projectKey, session, singleSession)) : null)
            }))
          }
          return h('div', { className: 'dfl-list' }, visibleFiles.map(renderRow))
        }

        function renderHistoryChooser() {
          if (historyOptions.length === 0) {
            return h('div', { className: 'dfl-empty' },
              h('p', { className: 'dfl-empty-title' }, t('history.emptyTitle')),
              h('p', { className: 'dfl-empty-text' }, query.trim().length > 0 ? t('empty.filtered') : t('empty.history')))
          }
          return h('div', { className: 'dfl-list' },
            historyGroups.map(group => {
              const open = expandedProjects.get(group.key) ?? (query.trim().length > 0 || preferences?.collapseGroups === false)
              return h('div', { key: group.key || '__none__', className: 'dfl-project' },
                h('button', {
                  type: 'button',
                  className: 'dfl-project-head',
                  'aria-expanded': open,
                  onClick: () => setExpandedProjects(previous => {
                    const next = new Map(previous)
                    next.set(group.key, !open)
                    return next
                  }),
                },
                h('span', { className: 'dfl-project-chevron', 'aria-hidden': true }, open ? '▾' : '▸'),
                h('span', { className: 'dfl-project-name' }, group.name),
                h('span', { className: 'dfl-project-count' }, `${group.sessions.length}`),
                h('span', { className: 'dfl-project-path', title: group.cwd || '' }, group.cwd || '')),
                open ? group.sessions.map(row => h('button', {
                  key: row.id,
                  type: 'button',
                  className: 'dfl-session',
                  onClick: () => {
                    setHistoryId(row.id)
                    setQuery('')
                    setCategory('all')
                    setSourceFilter('all')
                    setArchivedOnly(false)
                    setFilterMenu(null)
                    setContextMenu(null)
                  },
                },
                h('span', { className: 'dfl-session-title' }, row.displayTitle || row.title || row.id),
                h('span', { className: 'dfl-session-meta' },
                  h('span', { className: 'dfl-session-project' }, row.cwd ? baseName(row.cwd) : t('history.noProject')),
                  h('span', { className: 'dfl-session-time' }, formatTime(row.updatedAt))))) : null)
            }))
        }

        function renderBody() {
          if (scope === 'history' && historyId === null) return renderHistoryChooser()
          return renderFileList()
        }

        function renderFooter() {
          const choosingHistory = scope === 'history' && historyId === null
          const total = scope === 'pins' ? pins.length : (currentData ? currentData.files.length : 0)
          const truncated = currentData && currentData.truncated
          return h('div', { className: 'dfl-foot' },
            h('span', { className: 'dfl-foot-count' },
              choosingHistory
                ? t('history.choose')
                : t('foot.count', { count: visibleFiles.length, total }) + (truncated ? t('foot.truncated') : '')),
            choosingHistory
              ? h('span', { className: 'dfl-foot-path' }, t('history.count', { count: historyOptions.length }))
              : (historyId !== null && scope === 'history'
                ? h('button', {
                  type: 'button', className: 'dfl-link dfl-foot-back',
                  onClick: () => { setHistoryId(null); setData(null); setQuery(''); setCategory('all'); setSourceFilter('all'); setArchivedOnly(false) },
                }, `← ${t('history.back')}`)
                : h('span', { className: 'dfl-foot-path', title: inventoryCwd || '' }, inventoryCwd || t('foot.noWorkspace'))))
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
            style: {
              background: 'var(--dsw-alias-bg-base)',
              display: 'flex', flexDirection: 'column',
            },
            onContextMenu: event => {
              event.preventDefault()
              setContextMenu({ file, x: event.clientX, y: event.clientY })
            },
          },
            h('div', { className: 'dfl-viewer-head', style: { background: 'var(--dsw-alias-bg-base)' } },
              h('div', { className: 'dfl-viewer-title', title: file.path },
                h('span', { className: 'dfl-viewer-name' }, file.name),
                h('span', { className: 'dfl-viewer-count' }, `${viewer.index + 1} / ${count}`)),
              h('div', { className: 'dfl-viewer-actions' },
                h('button', {
                  type: 'button', className: 'dfl-viewer-button', disabled: count < 2,
                  title: t('viewer.previous'), 'aria-label': t('viewer.previous'),
                  onClick: () => moveViewer(-1),
                }, '‹'),
                h('button', {
                  type: 'button', className: 'dfl-viewer-button', disabled: count < 2,
                  title: t('viewer.next'), 'aria-label': t('viewer.next'),
                  onClick: () => moveViewer(1),
                }, '›'),
                h('button', {
                  type: 'button', className: 'dfl-viewer-button', title: t('viewer.close'), 'aria-label': t('viewer.close'),
                  onClick: () => setViewer(null),
                }, '×'))),
            current.status === 'pages' ? h('div', { className: 'dfl-viewer-toolbar' },
              h('button', {
                type: 'button', className: 'dfl-viewer-button', disabled: current.page <= 0,
                title: t('viewer.previousPage'), 'aria-label': t('viewer.previousPage'),
                onClick: () => goViewerPage(-1),
              }, '‹'),
              h('span', { className: 'dfl-viewer-pagecount' }, `${current.page + 1} / ${current.totalPages}`),
              h('button', {
                type: 'button', className: 'dfl-viewer-button', disabled: current.page >= current.pages.length - 1,
                title: t('viewer.nextPage'), 'aria-label': t('viewer.nextPage'),
                onClick: () => goViewerPage(1),
              }, '›'),
              h('span', { className: 'dfl-viewer-sep' }),
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
              }, '+'),
              h('button', {
                type: 'button', className: 'dfl-viewer-link',
                onClick: () => preview(file),
              }, t('viewer.openSidebar')),
              current.truncated ? h('span', { className: 'dfl-viewer-note' }, t('viewer.truncated', { count: current.pages?.length || 0 })) : null) : null,
            h('div', {
              className: 'dfl-viewer-body',
              style: {
                flex: 1, minHeight: 0, background: 'var(--dsw-alias-bg-base)',
                position: 'relative', zIndex: 1,
              },
            },
              current.status === 'loading'
                ? h('div', { className: 'dfl-viewer-status' },
                  h('span', { className: 'dfl-spinner', 'aria-hidden': true }),
                  t(isOfficeFile(file) ? 'viewer.converting' : isPdfFile(file) ? 'viewer.rendering' : 'viewer.loading'))
                : current.status === 'error'
                  ? h('div', { className: 'dfl-viewer-status' },
                    h('p', { className: 'dfl-empty-title' }, t('viewer.failed')),
                    h('p', { className: 'dfl-empty-text' }, current.error),
                    h('button', {
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
                      ? h('img', {
                        className: 'dfl-viewer-image', src: current.url, alt: file.name,
                        onError: () => setViewerState({ status: 'error', error: t('viewer.failed'), file }),
                      })
                      : current.status === 'text'
                        ? h(React.Fragment, null,
                          current.truncated ? h('div', { key: 'banner', className: 'dfl-viewer-text-banner' }, t('viewer.textTruncated')) : null,
                          h('pre', { key: 'text', className: 'dfl-viewer-text' }, current.text))
                        : null),
            h('div', { className: 'dfl-viewer-foot', style: { background: 'var(--dsw-alias-bg-base)' } },
              h('span', null, t('viewer.hint')),
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
            item('copyPath', t('menu.copyPath'), () => copyPath(file)),
            item('copyRef', t('menu.copyRef'), () => copyReference([file])),
            !isFolder && !isMissing && isImageFile(file) ? item('copyImage', t('menu.copyImage'), () => copyImageFile(file)) : null,
            item('copyAttach', t('menu.attach'), () => attachToComposer([file])),
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
            h('div', { className: 'dfl-context-name', title: file.path }, file.name),
            h('div', { className: 'dfl-context-path', title: file.path }, file.path),
            isMissing ? h('div', { className: 'dfl-context-note' }, t('source.missingHint')) : null),
          primaryGroup.length > 0 ? h('div', { className: 'dfl-context-group' }, primaryGroup) : null,
          !isFolder && !isMissing ? h('div', { className: 'dfl-context-group' },
            h('div', { className: 'dfl-context-label' }, t('menu.apps')),
            cached && cached.loading ? h('div', { className: 'dfl-context-note' }, t('menu.detecting')) : null,
            apps.map(app => h('button', {
              key: app.id,
              type: 'button',
              className: 'dfl-menu-item',
              onClick: action(() => openNative(file, app.id)),
            }, h('span', { className: 'dfl-app-name' }, app.name || app.id), app.default ? h('span', { className: 'dfl-app-default' }, t('menu.defaultSuffix')) : null)),
            !cached || cached.loading || apps.length === 0 ? h('div', { className: 'dfl-context-note' }, t('menu.noApps')) : null) : null,
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
            h('div', { className: 'dfl-confirm-title' }, t('delete.title')),
            h('div', { className: 'dfl-confirm-name', title: file.path }, file.name),
            h('p', { className: 'dfl-confirm-text' }, t('delete.message')),
            file.source === 'attachment' ? h('p', { className: 'dfl-confirm-warning' }, t('delete.attachmentWarning')) : null,
            h('div', { className: 'dfl-confirm-actions' },
              h('button', { type: 'button', className: 'dfl-button', onClick: () => setPendingDelete(null) }, t('delete.cancel')),
              h('button', { type: 'button', className: 'dfl-button is-danger', onClick: () => void confirmDelete() }, t('delete.confirm'))),
          )), document.body)
        }

        return h('div', { className: 'dfl-root dfl-theme', ...themeAttributes(preferences, scheme) },
          renderHeader(),
          renderScopeTabs(),
          renderToolbar(),
          renderSelectionBar(),
          h('div', { className: 'dfl-body' }, renderBody()),
          renderFooter(),
          pinsError && scope === 'pins' ? h('div', { className: 'dfl-warning', role: 'alert' }, pinsError) : null,
          toast !== null ? h('div', { className: 'dfl-toast', role: 'status' }, toast.text) : null,
          renderViewer(),
          renderContextMenu(),
          renderDeleteConfirm())
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
      'scope.sentTitle': '我发送的 · 所有项目与对话',
      'scope.project': '当前项目',
      'scope.pins': '收藏',
      'scope.history': '历史对话',
      'action.refresh': '刷新',
      'action.select': '选择',
      'action.done': '完成',
      'action.preview': '在侧边栏预览',
      'action.previewInline': '在面板内预览',
      'action.menu': '打开方式',
      'action.folder': '在资源管理器中打开',
      'action.addToInput': '插入引用',
      'action.pin': '收藏',
      'action.unpin': '取消收藏',
      'action.archive': '归档',
      'action.copyPath': '复制路径',
      'action.copyRef': '复制引用',
      'search.placeholder': '搜索文件名、路径或说明',
      'history.search': '搜索历史对话',
      'sort.label': '排序',
      'sort.time': '按时间',
      'sort.name': '按名称',
      'sort.type': '按类型',
      'group.unknown': '未知项目',
      'group.workspace': '工作区文件',
      'group.untitled': '未命名会话',
      'filter.label': '类型筛选',
      'filter.button': '筛选',
      'filter.title': '筛选',
      'filter.clearAll': '清除全部',
      'filter.typeSection': '类型',
      'filter.sourceSection': '来源',
      'filter.withinAll': '全部类型内',
      'filter.withinAllSources': '全部来源内',
      'filter.within': '在「{value}」内',
      'filter.typeLabel': '类型',
      'filter.typeAll': '全部类型',
      'filter.byType': '按类型筛选',
      'filter.bySource': '按来源筛选',
      'filter.clear': '清除筛选',
      'filter.files': '{count} 个文件',
      'filter.sourceLabel': '来源筛选',
      'filter.sourceKey': '来源',
      'filter.sourceAll': '全部来源',
      'filter.archived': '已归档',
      'filter.all': '全部',
      'filter.document': '文档',
      'filter.slides': '演示',
      'filter.sheets': '表格',
      'filter.pdf': 'PDF',
      'filter.markdown': 'Markdown',
      'filter.text': '文本',
      'filter.image': '图片',
      'filter.web': '网页',
      'filter.code': '代码',
      'filter.media': '音视频',
      'filter.archive': '压缩包',
      'filter.design': '设计文件',
      'filter.executable': '程序',
      'filter.database': '数据库',
      'filter.font': '字体',
      'filter.disk': '磁盘镜像',
      'filter.binary': '二进制',
      'filter.folder': '文件夹',
      'filter.other': '其他',
      'source.delivered': '交付',
      'source.written': '生成',
      'source.edited': '修改',
      'source.attachment': '用户',
      'source.archived': '已归档',
      'source.missing': '不存在',
      'source.moved': '已移动',
      'source.missingHint': '原路径不存在，文件可能已删除或移动到其他磁盘。',
      'toast.missing': '文件不存在，可能已删除或移动',
      'source.read': '参考',
      'source.workspace': '工作区',
      'source.pinned': '收藏',
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
      'error.title': '读取失败',
      'error.retry': '重试',
      'viewer.title': '文件预览',
      'viewer.loading': '正在读取预览…',
      'viewer.converting': '正在转换 Office 文档…',
      'viewer.rendering': '正在渲染 PDF 页面…',
      'viewer.renderFailed': 'PDF 页面渲染失败',
      'viewer.officeUnavailable': 'Office 预览不可用',
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
      'scope.history': 'History',
      'action.refresh': 'Refresh',
      'action.select': 'Select',
      'action.done': 'Done',
      'action.preview': 'Preview in sidebar',
      'action.previewInline': 'Preview here',
      'action.menu': 'Open with',
      'action.folder': 'Open in Explorer',
      'action.addToInput': 'Insert reference',
      'action.pin': 'Pin',
      'action.unpin': 'Unpin',
      'action.archive': 'Archive',
      'action.copyPath': 'Copy path',
      'action.copyRef': 'Copy reference',
      'search.placeholder': 'Search name, path, or description',
      'history.search': 'Search conversations',
      'sort.label': 'Sort',
      'sort.time': 'By time',
      'sort.name': 'By name',
      'sort.type': 'By type',
      'group.unknown': 'Unknown project',
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
      'filter.byType': 'Filter by type',
      'filter.bySource': 'Filter by source',
      'filter.clear': 'Clear filters',
      'filter.files': '{count} files',
      'filter.sourceLabel': 'Source filter',
      'filter.sourceKey': 'Source',
      'filter.sourceAll': 'All sources',
      'filter.archived': 'Archived',
      'filter.all': 'All',
      'filter.document': 'Documents',
      'filter.slides': 'Slides',
      'filter.sheets': 'Sheets',
      'filter.pdf': 'PDF',
      'filter.markdown': 'Markdown',
      'filter.text': 'Text',
      'filter.image': 'Images',
      'filter.web': 'Web',
      'filter.code': 'Code',
      'filter.media': 'Media',
      'filter.archive': 'Archives',
      'filter.design': 'Design files',
      'filter.executable': 'Applications',
      'filter.database': 'Databases',
      'filter.font': 'Fonts',
      'filter.disk': 'Disk images',
      'filter.binary': 'Binaries',
      'filter.folder': 'Folders',
      'filter.other': 'Other',
      'source.delivered': 'Delivered',
      'source.written': 'Created',
      'source.edited': 'Edited',
      'source.attachment': 'User',
      'source.archived': 'Archived',
      'source.missing': 'Missing',
      'source.moved': 'Moved',
      'source.missingHint': 'The original path no longer exists; the file may have been deleted or moved to another drive.',
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
      'error.title': 'Could not read files',
      'error.retry': 'Retry',
      'viewer.title': 'File preview',
      'viewer.loading': 'Reading preview…',
      'viewer.converting': 'Converting Office document…',
      'viewer.rendering': 'Rendering PDF pages…',
      'viewer.renderFailed': 'PDF page rendering failed',
      'viewer.officeUnavailable': 'Office preview unavailable',
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
.dfl-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  font-size: 13px;
  line-height: 20px;
}
.dfl-root *, .dfl-root *::before, .dfl-root *::after { box-sizing: border-box; }
.dfl-head { padding: 12px 14px 8px; border-bottom: 0.5px solid var(--dsw-alias-border-l3); flex: none; }
.dfl-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dfl-title { display: flex; align-items: center; gap: 7px; min-width: 0; color: var(--dsw-alias-label-primary); }
.dfl-head-back {
  width: 26px; height: 26px; flex: none; border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 7px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 14px; line-height: 1; cursor: pointer;
}
.dfl-head-back:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dfl-title-text { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dfl-head-actions { display: flex; align-items: center; gap: 2px; flex: none; }
.dfl-tool {
  height: 26px; min-width: 26px; padding: 0 6px; border: 0; border-radius: 7px;
  background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px;
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
}
.dfl-tool:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dfl-tool.is-on { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }
.dfl-select-toggle { font-size: 12px; padding: 0 9px; }
.dfl-subtitle { margin-top: 3px; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.dfl-subtitle-title { font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dfl-subtitle-path { font-size: 11px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; }
.dfl-scopes { display: flex; gap: 4px; padding: 8px 12px 7px; overflow-x: auto; flex: none; scrollbar-width: none; }
.dfl-scopes::-webkit-scrollbar { display: none; }
.dfl-scope {
  border: 0.5px solid transparent; border-radius: 999px; background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12px; line-height: 22px; padding: 0 10px; white-space: nowrap; cursor: pointer;
}
.dfl-scope:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dfl-scope[aria-pressed="true"] {
  background: var(--dsw-alias-bg-layer-1); border-color: var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-primary); font-weight: 500;
}
.dfl-toolbar { padding: 0 12px 8px; display: flex; flex-direction: column; gap: 7px; flex: none; }
.dfl-search-row { display: flex; gap: 6px; align-items: center; }
.dfl-search {
  flex: 1; min-width: 0; height: 30px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px;
  padding: 0 9px; outline: none;
}
.dfl-search::placeholder { color: var(--dsw-alias-label-tertiary); }
.dfl-search:focus-visible { border-color: var(--dsw-alias-state-business-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 22%, transparent); }
.dfl-sort {
  height: 30px; max-width: 104px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; padding: 0 4px;
}
.dfl-filterbar { position: relative; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-height: 28px; }
.dfl-filter-button { padding: 0 10px; font-weight: 500; }
.dfl-filter-button-text { color: inherit; }
.dfl-filter-active-count {
  min-width: 17px; height: 17px; padding: 0 5px; border-radius: 9px; display: inline-flex;
  align-items: center; justify-content: center; background: var(--dsw-alias-state-business-primary);
  color: #fff; font-size: 10px; line-height: 1;
}
.dfl-filter-tag {
  display: inline-flex; align-items: center; gap: 3px; height: 26px; padding: 0 4px 0 8px;
  border: 0.5px solid var(--dsw-alias-border-l3); border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary);
  font-size: 11px; white-space: nowrap;
}
.dfl-filter-tag-label { max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
.dfl-filter-tag-clear {
  width: 18px; height: 18px; border: 0; border-radius: 4px; background: transparent;
  color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 1; cursor: pointer; padding: 0;
}
.dfl-filter-tag-clear:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dfl-filter-panel {
  width: min(460px, calc(100vw - 40px)); max-height: 380px; padding: 6px;
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 8px;
}
.dfl-filter-panel-head { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; padding: 5px 8px 6px; }
.dfl-filter-panel-title { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.dfl-filter-column { min-width: 0; }
.dfl-filter-column.is-child { border-left: 0.5px solid var(--dsw-alias-border-l3); padding-left: 9px; }
.dfl-filter-section-title { padding: 5px 8px 3px; font-size: 10px; color: var(--dsw-alias-label-tertiary); }
.dfl-filter-child-title { display: flex; align-items: baseline; gap: 4px; min-width: 0; }
.dfl-filter-parent { margin-left: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-caption); }
.dfl-filter-divider { height: 0.5px; margin: 5px 4px; background: var(--dsw-alias-border-l3); }
.dfl-filter-trigger {
  display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 9px;
  border: 0.5px solid var(--dsw-alias-border-l3); border-radius: 8px;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap;
}
.dfl-filter-trigger:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dfl-filter-trigger.is-on { border-color: var(--dsw-alias-state-business-primary); color: var(--dsw-alias-state-business-primary); background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 7%, transparent); }
.dfl-filter-trigger.is-open { border-color: var(--dsw-alias-state-business-primary); }
.dfl-filter-key { font-size: 10.5px; color: var(--dsw-alias-label-tertiary); }
.dfl-filter-trigger.is-on .dfl-filter-key { color: currentColor; opacity: 0.75; }
.dfl-filter-value { font-weight: 500; }
.dfl-filter-count {
  min-width: 17px; padding: 0 5px; border-radius: 9px; text-align: center;
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-tertiary);
  font-size: 10px; line-height: 16px;
}
.dfl-filter-clear { border: 0; background: transparent; color: var(--dsw-alias-state-business-primary); font: inherit; font-size: 11px; cursor: pointer; padding: 4px 2px; }
.dfl-filter-total { margin-left: auto; color: var(--dsw-alias-label-tertiary); font-size: 10.5px; white-space: nowrap; }
.dfl-filter-popover {
  position: absolute; top: calc(100% + 5px); left: 0; z-index: 36;
  width: 252px; max-height: 300px; overflow-y: auto; overscroll-behavior: contain;
  padding: 5px; border-radius: 10px; border: 0.5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-base); box-shadow: 0 14px 40px rgba(0, 0, 0, 0.24);
}
.dfl-filter-popover-title { padding: 5px 8px 6px; font-size: 10px; color: var(--dsw-alias-label-tertiary); }
.dfl-filter-option {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 8px;
  border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; text-align: left; cursor: pointer;
}
.dfl-filter-option:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dfl-filter-option.is-on { color: var(--dsw-alias-state-business-primary); background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 7%, transparent); }
.dfl-filter-option-label { flex: 1; }
.dfl-filter-option-count { color: var(--dsw-alias-label-tertiary); font-size: 10.5px; }
.dfl-filter-option.is-on .dfl-filter-option-count { color: currentColor; opacity: 0.75; }
.dfl-filter-check { color: currentColor; font-size: 12px; }
.dfl-chips { display: flex; gap: 5px; overflow-x: auto; scrollbar-width: none; padding-bottom: 1px; }
.dfl-grouped-list { padding-bottom: 6px; }
.dfl-file-group { border-top: 0.5px solid var(--dsw-alias-border-l3); }
.dfl-file-group:first-child { border-top: 0; }
.dfl-group-project-head {
  display: flex; align-items: center; gap: 6px; width: 100%; padding: 9px 13px 7px;
  border: 0; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 11px; text-align: left; cursor: pointer;
}
.dfl-group-project-head:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dfl-group-chevron { flex: none; width: 12px; color: var(--dsw-alias-label-tertiary); font-size: 10px; }
.dfl-group-name { flex: none; font-weight: 600; }
.dfl-group-count { flex: none; color: var(--dsw-alias-label-tertiary); font-size: 10px; }
.dfl-group-path {
  min-width: 0; margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--dsw-alias-label-caption); font-size: 10px; direction: rtl; text-align: left;
}
.dfl-group-session-head {
  display: flex; align-items: center; gap: 5px; width: 100%; padding: 6px 13px 4px 25px;
  border: 0; background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 11px; text-align: left; cursor: pointer;
}
.dfl-group-session-head:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dfl-group-session-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dfl-file-session .dfl-item { padding-left: 10px; }
.dfl-chips::-webkit-scrollbar { display: none; }
.dfl-chip {
  border: 0.5px solid transparent; border-radius: 999px; background: transparent; color: var(--dsw-alias-label-tertiary);
  font: inherit; font-size: 11px; line-height: 22px; padding: 0 8px; white-space: nowrap; cursor: pointer;
  display: inline-flex; align-items: center; gap: 4px;
}
.dfl-chip:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); }
.dfl-chip.is-on { background: var(--dsw-alias-bg-layer-1); border-color: var(--dsw-alias-border-l3); color: var(--dsw-alias-label-primary); }
.dfl-chip-count { font-size: 10px; color: var(--dsw-alias-label-caption); }
.dfl-selectbar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 7px 12px;
  border-top: 0.5px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-layer-1); flex: none;
}
.dfl-select-count { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dfl-spacer { flex: 1; }
.dfl-link { border: 0; background: transparent; color: var(--dsw-alias-state-business-primary); font: inherit; font-size: 11px; padding: 2px 3px; cursor: pointer; border-radius: 4px; }
.dfl-link:hover { text-decoration: underline; }
.dfl-body { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.dfl-list { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 6px 10px; scrollbar-width: thin; }
.dfl-item { border-radius: 8px; }
.dfl-row {
  display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 8px; cursor: pointer;
  border: 0.5px solid transparent; min-height: 46px;
}
.dfl-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dfl-row:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: -2px; }
.dfl-row.is-selected { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 9%, transparent); border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 22%, transparent); }
.dfl-row.is-open { background: var(--dsw-alias-interactive-bg-active); }
.dfl-check { width: 14px; height: 14px; flex: none; accent-color: var(--dsw-alias-state-business-primary); margin: 0; }
.dfl-icon {
  width: 30px; height: 30px; border-radius: 8px; flex: none; display: grid; place-items: center;
  color: #fff; font-size: 8px; font-weight: 700; letter-spacing: 0.02em; line-height: 1;
  background: #4a5568; overflow: hidden;
}
.dfl-icon[data-cat="document"] { background: #2b6cb0; }
.dfl-icon[data-cat="slides"] { background: #c05621; }
.dfl-icon[data-cat="sheets"] { background: #2f855a; }
.dfl-icon[data-cat="pdf"] { background: #c53030; }
.dfl-icon[data-cat="markdown"] { background: #4c51bf; }
.dfl-icon[data-cat="text"] { background: #4a5568; }
.dfl-icon[data-cat="image"] { background: #b83280; }
.dfl-icon[data-cat="web"] { background: #2c7a7b; }
.dfl-icon[data-cat="code"] { background: #6b46c1; }
.dfl-icon[data-cat="media"] { background: #975a16; }
.dfl-icon[data-cat="archive"] { background: #718096; }
.dfl-icon[data-cat="design"] { background: #9b2c2c; }
.dfl-icon[data-cat="executable"] { background: #285e61; }
.dfl-icon[data-cat="database"] { background: #2c5282; }
.dfl-icon[data-cat="font"] { background: #744210; }
.dfl-icon[data-cat="disk"] { background: #5a67d8; }
.dfl-icon[data-cat="binary"] { background: #4a5568; }
.dfl-icon[data-cat="folder"] { background: #b7791f; }
.dfl-icon[data-cat="other"] { background: #4a5568; }
.dfl-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.dfl-name-line { display: flex; align-items: center; gap: 5px; min-width: 0; }
.dfl-name { font-size: 13px; font-weight: 500; color: var(--dsw-alias-label-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dfl-badge {
  flex: none; font-size: 9px; line-height: 15px; padding: 0 4px; border-radius: 4px;
  background: var(--dsw-alias-bg-layer-1); border: 0.5px solid var(--dsw-alias-border-l3); color: var(--dsw-alias-label-tertiary);
}
.dfl-badge.is-delivered { color: #2f855a; border-color: color-mix(in srgb, #2f855a 35%, transparent); }
.dfl-badge.is-pinned { color: #b7791f; border-color: color-mix(in srgb, #b7791f 40%, transparent); }
.dfl-badge.is-user { color: #2b6cb0; border-color: color-mix(in srgb, #2b6cb0 35%, transparent); }
.dfl-badge.is-archived { color: #6b46c1; border-color: color-mix(in srgb, #6b46c1 35%, transparent); }
.dfl-badge.is-folder { color: var(--dsw-alias-label-secondary); border-color: var(--dsw-alias-border-l3); }
.dfl-badge.is-missing { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent); }
.dfl-badge.is-moved { color: var(--dsw-alias-state-warning-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-warning-primary) 35%, transparent); }
.dfl-row.is-missing { opacity: 0.72; }
.dfl-meta { display: flex; align-items: baseline; gap: 0; min-width: 0; color: var(--dsw-alias-label-tertiary); font-size: 10.5px; }
.dfl-meta-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.dfl-desc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--dsw-alias-label-caption); }
.dfl-row-actions { display: flex; align-items: center; gap: 3px; flex: none; opacity: 1; }
.dfl-open-button {
  height: 24px; padding: 0 7px; border: 0.5px solid var(--dsw-alias-border-l3); border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 11px; line-height: 1; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;
}
.dfl-open-button:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dfl-open-button:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 1px; }
.dfl-chevron { font-size: 9px; opacity: 0.7; }
.dfl-icon-button {
  width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 14px; line-height: 1; cursor: pointer; display: grid; place-items: center; padding: 0;
}
.dfl-icon-button:hover { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }
.dfl-menu { margin: 2px 8px 8px 46px; padding: 7px; border: 0.5px solid var(--dsw-alias-border-l3); border-radius: 9px; background: var(--dsw-alias-bg-layer-1); display: flex; flex-direction: column; gap: 5px; }
.dfl-menu-select {
  width: 100%; height: 30px; border-radius: 7px; border: 0.5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; padding: 0 5px;
}
.dfl-menu-note { margin: 0; font-size: 10.5px; color: var(--dsw-alias-label-tertiary); line-height: 15px; }
.dfl-session {
  display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; padding: 9px 9px;
  border: 0.5px solid transparent; border-radius: 8px; background: transparent; color: inherit; font: inherit; cursor: pointer;
}
.dfl-session:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dfl-session:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: -2px; }
.dfl-session-title { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dfl-session-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 10.5px; color: var(--dsw-alias-label-tertiary); }
.dfl-session-project { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dfl-session-time { flex: none; }
.dfl-project { margin-bottom: 4px; }
.dfl-project-head {
  display: flex; align-items: center; gap: 6px; width: 100%; padding: 7px 8px; border: 0;
  border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 11.5px; text-align: left; cursor: pointer;
}
.dfl-project-head:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dfl-project-head:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: -2px; }
.dfl-project-chevron { width: 11px; flex: none; color: var(--dsw-alias-label-tertiary); font-size: 10px; }
.dfl-project-name { font-weight: 600; flex: none; max-width: 45%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dfl-project-count {
  flex: none; min-width: 17px; padding: 0 4px; border-radius: 999px; text-align: center;
  background: var(--dsw-alias-bg-layer-1); border: 0.5px solid var(--dsw-alias-border-l3);
  font-size: 9.5px; line-height: 14px; color: var(--dsw-alias-label-tertiary);
}
.dfl-project-path { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--dsw-alias-label-tertiary); font-size: 10px; }
.dfl-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; padding: 28px 22px; text-align: center; }
.dfl-empty-title { margin: 0; font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.dfl-empty-text { margin: 0; font-size: 11.5px; color: var(--dsw-alias-label-tertiary); line-height: 17px; max-width: 300px; }
.dfl-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--dsw-alias-border-l3); border-top-color: var(--dsw-alias-state-business-primary); animation: dfl-spin 0.8s linear infinite; }
@keyframes dfl-spin { to { transform: rotate(360deg); } }
.dfl-button {
  height: 27px; padding: 0 10px; border-radius: 7px; border: 0.5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 11.5px; cursor: pointer;
}
.dfl-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dfl-button:disabled { opacity: 0.45; cursor: default; }
.dfl-foot {
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 7px 13px; border-top: 0.5px solid var(--dsw-alias-border-l3); font-size: 10.5px; color: var(--dsw-alias-label-tertiary);
}
.dfl-foot-count { flex: none; }
.dfl-foot-path { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; min-width: 0; }
.dfl-foot-back { flex: none; }
.dfl-warning { padding: 6px 13px; font-size: 10.5px; color: var(--dsw-alias-state-error-primary); border-top: 0.5px solid var(--dsw-alias-border-l3); }
.dfl-toast {
  position: absolute; left: 12px; right: 12px; bottom: 38px; z-index: 5; padding: 7px 10px; border-radius: 8px;
  background: rgba(24, 26, 32, 0.94); color: #fff; font-size: 11.5px; line-height: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.24); pointer-events: none;
}
.dfl-source-chips { padding-top: 1px; }
.dfl-archived-chip { border-color: color-mix(in srgb, #6b46c1 28%, transparent) !important; }
.dfl-context-layer { position: fixed; inset: 0; z-index: 10002; }
.dfl-context-menu {
  position: fixed; z-index: 10003; overflow-y: auto; overscroll-behavior: contain;
  padding: 5px; border-radius: 10px; border: 0.5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  box-shadow: 0 14px 42px rgba(0, 0, 0, 0.28); font-size: 12px; line-height: 18px;
}
.dfl-context-head { padding: 6px 8px 8px; border-bottom: 0.5px solid var(--dsw-alias-border-l3); }
.dfl-context-name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dfl-context-path { margin-top: 2px; font-size: 10px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; }
.dfl-context-group { padding: 4px 0; border-top: 0.5px solid var(--dsw-alias-border-l3); }
.dfl-context-group:first-of-type { border-top: 0; }
.dfl-context-label { padding: 3px 8px; font-size: 10px; color: var(--dsw-alias-label-tertiary); }
.dfl-context-note { padding: 3px 8px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.dfl-menu-item {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; padding: 6px 8px; border: 0; border-radius: 6px;
  background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.dfl-menu-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dfl-menu-item.is-danger { color: var(--dsw-alias-state-error-primary); }
.dfl-context-danger { margin-top: 2px; }
.dfl-app-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dfl-app-default { flex: none; font-size: 10px; color: var(--dsw-alias-label-tertiary); }
.dfl-confirm-modal {
  position: fixed; inset: 0; z-index: 10004; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: rgba(12, 14, 19, 0.62);
}
.dfl-confirm-card {
  width: min(390px, 92vw); padding: 16px; border-radius: 12px;
  border: 0.5px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary); box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
  font-size: 12px; line-height: 19px;
}
.dfl-confirm-title { font-size: 14px; font-weight: 600; }
.dfl-confirm-name { margin-top: 6px; font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dfl-confirm-text { margin: 6px 0 0; color: var(--dsw-alias-label-secondary); }
.dfl-confirm-warning { margin: 6px 0 0; color: var(--dsw-alias-state-warning-primary); }
.dfl-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.dfl-button.is-danger { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.dfl-viewer-modal {
  position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: rgba(12, 14, 19, 0.66);
}
.dfl-viewer {
  width: min(1180px, 94vw); height: min(860px, 90vh); display: flex; flex-direction: column;
  overflow: hidden; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font-size: 13px; line-height: 20px; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
}
.dfl-viewer-head {
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 8px 10px; border-bottom: 0.5px solid var(--dsw-alias-border-l3);
}
.dfl-viewer-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dfl-viewer-name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dfl-viewer-count { flex: none; font-size: 10px; color: var(--dsw-alias-label-tertiary); }
.dfl-viewer-actions { display: flex; align-items: center; gap: 2px; flex: none; }
.dfl-viewer-button {
  width: 26px; height: 26px; border: 0; border-radius: 7px; background: transparent;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 16px; line-height: 1; cursor: pointer;
  display: grid; place-items: center;
}
.dfl-viewer-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dfl-viewer-button:disabled { opacity: 0.3; cursor: default; }
.dfl-viewer-body {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  overflow: auto; background: var(--dsw-alias-bg-layer-2);
}
.dfl-viewer-text-banner {
  flex: none; padding: 6px 12px; border-bottom: 0.5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); font-size: 11px;
}
.dfl-viewer-toolbar {
  flex: none; display: flex; align-items: center; gap: 5px; padding: 6px 12px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-base);
}
.dfl-viewer-pagecount { min-width: 64px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.dfl-viewer-sep { width: 0.5px; height: 18px; margin: 0 5px; background: var(--dsw-alias-border-l3); }
.dfl-viewer-fit {
  height: 26px; padding: 0 8px; border: 0.5px solid var(--dsw-alias-border-l3); border-radius: 6px;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 11px; cursor: pointer; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dfl-viewer-fit[aria-pressed="true"] { border-color: var(--dsw-alias-state-business-primary); color: var(--dsw-alias-state-business-primary); }
.dfl-viewer-link { margin-left: auto; border: 0; background: transparent; color: var(--dsw-alias-state-business-primary); font: inherit; font-size: 11px; cursor: pointer; }
.dfl-viewer-note { color: var(--dsw-alias-label-tertiary); font-size: 10px; white-space: nowrap; }
.dfl-pdf-scroll {
  width: 100%; height: 100%; overflow: auto; align-self: stretch;
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  padding: 16px; box-sizing: border-box;
}
.dfl-pdf-page {
  flex: none; position: relative; background: #fff;
  border-radius: 3px; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.16);
}
.dfl-pdf-page img { display: block; width: 100%; height: auto; }
.dfl-pdf-page-number {
  position: absolute; right: 8px; bottom: 8px; padding: 1px 5px; border-radius: 4px;
  background: rgba(0, 0, 0, 0.38); color: #fff; font-size: 10px; line-height: 15px;
}
.dfl-viewer-frame { width: 100%; height: 100%; border: 0; display: block; background: #fff; }
.dfl-viewer-image {
  max-width: calc(100% - 24px); max-height: calc(100% - 24px); object-fit: contain; display: block; margin: auto;
  border-radius: 6px; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
}
.dfl-viewer-text {
  margin: 0; padding: 12px; width: 100%; height: 100%; overflow: auto; box-sizing: border-box;
  white-space: pre-wrap; word-break: break-word; font: 12px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--dsw-alias-label-primary);
}
.dfl-viewer-status {
  display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 28px 22px; text-align: center;
  color: var(--dsw-alias-label-secondary); font-size: 12px;
}
.dfl-viewer-status .dfl-empty-title { color: var(--dsw-alias-label-primary); }
.dfl-viewer-status .dfl-empty-text { word-break: break-word; }
.dfl-viewer-foot {
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 6px 10px; border-top: 0.5px solid var(--dsw-alias-border-l3); font-size: 10px; color: var(--dsw-alias-label-tertiary);
}
.dfl-viewer-path { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; min-width: 0; }
.dfl-title-chip { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.dfl-header-entry {
  width: 24px; height: 24px; padding: 0; border: 0; border-radius: 7px;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.dfl-header-entry:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dfl-header-entry:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 1px; }
.dfl-composer-entry {
  height: 24px; max-width: 96px; padding: 0 8px; border: 0; border-radius: 999px;
  display: inline-flex; align-items: center; gap: 4px; background: transparent;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer;
}
.dfl-composer-entry:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dfl-composer-entry:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 1px; }
.dfl-composer-entry-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dfl-settings { max-width: 760px; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; }
.dfl-settings-heading h2 { margin: 0 0 2px; font-size: 16px; }
.dfl-settings-heading p { margin: 0 0 14px; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.dfl-settings-card { margin-bottom: 12px; padding: 12px 14px; border: 0.5px solid var(--dsw-alias-border-l3); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.dfl-settings-card h3 { margin: 0 0 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dfl-settings-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 32px; padding: 3px 0; }
.dfl-settings-label { display: flex; flex-direction: column; gap: 1px; }
.dfl-settings-hint { color: var(--dsw-alias-label-tertiary); font-size: 10px; }
.dfl-settings-row input[type="number"], .dfl-settings-row select {
  width: 130px; height: 28px; padding: 0 7px; border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 7px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px;
}
.dfl-settings-row input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--dsw-alias-state-business-primary); }
.dfl-settings-text-wrap { display: flex; align-items: center; gap: 6px; flex: 1; max-width: 340px; }
.dfl-settings-text {
  flex: 1; min-width: 0; height: 30px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; padding: 0 8px;
}
.dfl-settings-clear {
  height: 30px; padding: 0 10px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px; cursor: pointer;
}
.dfl-settings-clear:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dfl-settings-path { display: flex; gap: 12px; padding: 3px 0; font-size: 11px; }
.dfl-settings-path span { flex: none; width: 90px; color: var(--dsw-alias-label-tertiary); }
.dfl-settings-path code { min-width: 0; color: var(--dsw-alias-label-secondary); word-break: break-all; }
.dfl-settings-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.dfl-settings-status { margin-right: auto; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.dfl-settings-save {
  height: 30px; padding: 0 14px; border: 0; border-radius: 8px;
  background: var(--dsw-alias-state-business-primary); color: #fff; font: inherit; font-size: 12px; cursor: pointer;
}
.dfl-settings-save:disabled { opacity: 0.55; cursor: default; }
.dfl-settings-loading { display: flex; align-items: center; gap: 8px; padding: 20px; color: var(--dsw-alias-label-tertiary); }
.dfl-settings .dfl-spinner { width: 14px; height: 14px; }
/* ── appearance: theme (follow DSH / light / dark / system) ── */
.dfl-theme {
  color: var(--dsw-alias-label-primary);
}
.dfl-theme[data-dfl-scheme="light"],
html[data-dfl-theme="light"] .dfl-theme {
  color-scheme: light;
  --dsw-alias-bg-base: #f5f7fb;
  --dsw-alias-bg-layer-1: #ffffff;
  --dsw-alias-bg-layer-2: #eef1f7;
  --dsw-alias-border-l3: rgba(15, 23, 42, 0.13);
  --dsw-alias-label-primary: #101828;
  --dsw-alias-label-secondary: #475467;
  --dsw-alias-label-tertiary: #7b8798;
  --dsw-alias-label-caption: #98a2b3;
  --dsw-alias-interactive-bg-hover: rgba(15, 23, 42, 0.055);
  --dsw-alias-interactive-bg-active: rgba(15, 23, 42, 0.09);
  --dsw-alias-state-business-primary: #2563eb;
  --dsw-alias-state-error-primary: #d92d20;
  --dsw-alias-state-warning-primary: #b54708;
  --dsw-focus-ring-color: #2563eb;
  color: var(--dsw-alias-label-primary);
}
.dfl-theme[data-dfl-scheme="dark"],
html[data-dfl-theme="dark"] .dfl-theme {
  color-scheme: dark;
  --dsw-alias-bg-base: #0d1117;
  --dsw-alias-bg-layer-1: #151b24;
  --dsw-alias-bg-layer-2: #1b2430;
  --dsw-alias-border-l3: rgba(255, 255, 255, 0.13);
  --dsw-alias-label-primary: #e8eef7;
  --dsw-alias-label-secondary: #aeb9c8;
  --dsw-alias-label-tertiary: #8492a6;
  --dsw-alias-label-caption: #6f7d90;
  --dsw-alias-interactive-bg-hover: rgba(255, 255, 255, 0.07);
  --dsw-alias-interactive-bg-active: rgba(255, 255, 255, 0.12);
  --dsw-alias-state-business-primary: #60a5fa;
  --dsw-alias-state-error-primary: #f97066;
  --dsw-alias-state-warning-primary: #fdb022;
  --dsw-focus-ring-color: #60a5fa;
}
.dfl-root.dfl-theme { background: var(--dsw-alias-bg-base); }
.dfl-settings-row.dfl-settings-theme-row { align-items: flex-start; }
.dfl-theme-picker { display: grid; grid-template-columns: repeat(2, minmax(76px, 1fr)); gap: 6px; width: 214px; }
.dfl-theme-option {
  height: 30px; padding: 0 8px; border: 0.5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 11px; cursor: pointer;
}
.dfl-theme-option:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dfl-theme-option.is-active {
  color: #fff; background: var(--dsw-alias-state-business-primary);
  border-color: transparent;
}
.dfl-theme[data-dfl-scheme="dark"] .dfl-theme-option.is-active,
html[data-dfl-theme="dark"] .dfl-theme-option.is-active { color: #08111f; }
.dfl-theme[data-dfl-scheme="dark"] .dfl-toast,
body[data-ds-dark-theme] .dfl-toast { background: rgba(245, 246, 250, 0.96); color: #111318; }
@media (max-width: 460px) { .dfl-icon-button { display: none; } }
@media (prefers-reduced-motion: reduce) { .dfl-spinner { animation-duration: 2.4s; } }
`

    return {
      inject,
      apply,
      __internals: {
        NS, KIND, ID, CSS, zh, en,
        fileAddressFor, referenceText, categoryOf, extensionLabel,
        fileRowKey, isImageFile, canPanelPreview, themeAttributes, EXTENSION_CATEGORY,
        readLocalAppearance, writeLocalAppearance, applyDocumentTheme,
      },
    }
  },
})
