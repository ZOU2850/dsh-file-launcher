/**
 * Pure helpers shared by the File Launcher host service: path spelling,
 * document categorization, reference text, and argument scanning.
 */

import { extname } from 'node:path'

/** Extensions the workspace scan collects, mapped to their UI category. */
export const CATEGORY_BY_EXTENSION = new Map(Object.entries({
  document: ['.doc', '.docx', '.odt', '.rtf', '.pages', '.wps'],
  slides: ['.ppt', '.pptx', '.odp', '.key', '.dps'],
  sheets: ['.xls', '.xlsx', '.xlsm', '.csv', '.tsv', '.ods', '.numbers', '.et'],
  pdf: ['.pdf'],
  markdown: ['.md', '.markdown', '.mdx'],
  text: ['.txt', '.log', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.xml', '.env', '.properties'],
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tif', '.tiff', '.avif'],
  web: ['.html', '.htm', '.css', '.scss', '.sass', '.less', '.vue', '.svelte', '.astro'],
  code: ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.jsonc', '.jsonl', '.py', '.ps1', '.psm1',
    '.sh', '.bash', '.zsh', '.bat', '.cmd', '.java', '.kt', '.kts', '.go', '.rs', '.c', '.h', '.cc', '.cpp',
    '.cxx', '.hpp', '.cs', '.rb', '.php', '.swift', '.lua', '.r', '.scala', '.sql', '.dart', '.ex', '.exs',
    '.erl', '.hs', '.clj', '.gradle', '.make', '.dockerfile', '.graphql', '.gql', '.proto'],
  media: ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac'],
  archive: ['.zip', '.7z', '.rar', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.zst'],
  design: ['.psd', '.ai', '.eps', '.sketch', '.fig', '.xd', '.dwg', '.dxf', '.blend', '.obj', '.stl', '.3ds', '.indd', '.afdesign'],
  executable: ['.exe', '.msi', '.msix', '.appx', '.app', '.dmg', '.pkg', '.deb', '.rpm', '.apk', '.appimage'],
  database: ['.db', '.sqlite', '.sqlite3', '.mdb', '.accdb', '.dbf', '.parquet'],
  font: ['.ttf', '.otf', '.woff', '.woff2', '.eot'],
  disk: ['.iso', '.img', '.vhd', '.vhdx', '.vmdk'],
  binary: ['.bin', '.dat', '.pak', '.wasm', '.dll', '.so', '.dylib', '.o', '.a', '.lib', '.class', '.pyc'],
}).flatMap(([category, extensions]) => extensions.map(extension => [extension, category])))

/** Canonical category display order aligned with Antigravity File Launcher. */
export const CATEGORY_ORDER = [
  'document', 'slides', 'sheets', 'pdf', 'markdown', 'image', 'text', 'web',
  'code', 'media', 'archive', 'design', 'database', 'font', 'executable', 'disk', 'binary', 'folder', 'other',
]

/** Human labels for categories, used by the agent tool summary. */
export const CATEGORY_LABELS = {
  document: 'document',
  slides: 'slides',
  sheets: 'spreadsheet',
  pdf: 'PDF',
  markdown: 'Markdown',
  text: 'text',
  image: 'image',
  web: 'web page',
  code: 'code',
  media: 'media',
  archive: 'archive',
  design: 'design file',
  executable: 'application',
  database: 'database',
  font: 'font',
  disk: 'disk image',
  binary: 'binary',
  folder: 'folder',
  other: 'file',
}

/** Tool names whose successful result names a produced file. */
const PRODUCING_TOOLS = new Set([
  'write', 'edit', 'str_replace_editor', 'apply_patch', 'read', 'read_image', 'present',
  'word_create', 'word_update', 'excel_create', 'excel_update', 'ppt_create', 'ppt_update',
  'office_open', 'office_edit', 'office_create', 'office_convert', 'office_render',
])

/** Tool names that read a file rather than produce it. */
const READING_TOOLS = new Set(['read', 'read_image'])

/**
 * Lowercase extension of a path name, including the dot.
 * @param name - file name or absolute path.
 * @returns the extension, or an empty string.
 */
export function extensionOf(name) {
  const extension = extname(String(name)).toLowerCase()
  return extension.length > 1 ? extension : ''
}

/**
 * UI category of one file name or item object.
 * @param nameOrItem - file name, path, or item record (`{ name, path, isFolder }`).
 * @param isFolder - optional explicit folder flag.
 * @returns a category key from {@link CATEGORY_BY_EXTENSION}, `'folder'`, or `'other'`.
 */
export function categoryOf(nameOrItem, isFolder = false) {
  if (isFolder === true) return 'folder'
  if (nameOrItem && typeof nameOrItem === 'object') {
    if (nameOrItem.isFolder === true) return 'folder'
    return CATEGORY_BY_EXTENSION.get(extensionOf(nameOrItem.name || nameOrItem.path || '')) ?? 'other'
  }
  return CATEGORY_BY_EXTENSION.get(extensionOf(nameOrItem)) ?? 'other'
}

/**
 * Normalize slashes for comparison and display.
 * @param value - path text.
 * @returns the text with backslashes replaced by slashes.
 */
export function slashPath(value) {
  return String(value).replace(/\\/g, '/')
}

/**
 * Normalize a path into a stable comparison key.
 * @param value - absolute or relative path.
 * @param caseInsensitive - fold case when the execution world is Windows-like.
 * @returns the comparison key.
 */
export function pathKey(value, caseInsensitive = true) {
  const normalized = slashPath(value).replace(/\/+$/, '')
  return caseInsensitive ? normalized.toLowerCase() : normalized
}

/**
 * Relative display path inside a workspace root, or the absolute path outside.
 * @param absolutePath - absolute file path.
 * @param cwd - workspace root, when known.
 * @returns the relative or absolute display path with forward slashes.
 */
export function displayPath(absolutePath, cwd) {
  const file = slashPath(absolutePath)
  const root = typeof cwd === 'string' ? slashPath(cwd).replace(/\/+$/, '') : ''
  if (root.length === 0) return file
  if (file.toLowerCase() === root.toLowerCase()) return ''
  if (file.toLowerCase().startsWith(`${root.toLowerCase()}/`)) return file.slice(root.length + 1)
  return file
}

/**
 * Basename using either separator.
 * @param value - path text.
 * @returns the final segment.
 */
export function baseName(value) {
  const normalized = String(value).replace(/[/\\]+$/, '')
  return normalized.slice(Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\')) + 1)
}

/**
 * Whether an absolute path lies at or below a workspace root.
 * @param absolutePath - absolute file path.
 * @param cwd - workspace root.
 * @returns whether the path is inside the root.
 */
export function isInsideWorkspace(absolutePath, cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0) return false
  const file = pathKey(absolutePath, CASE_INSENSITIVE_PATHS)
  const root = pathKey(cwd, CASE_INSENSITIVE_PATHS)
  return file === root || file.startsWith(`${root}/`)
}

/**
 * Format one file as a composer reference: `@relative/path` inside the
 * workspace, `@"absolute path"` with spaces, and a quoted absolute path outside.
 * @param absolutePath - absolute file path.
 * @param cwd - workspace root, when known.
 * @returns the reference text.
 */
export function referenceText(absolutePath, cwd) {
  const absolute = slashPath(absolutePath)
  const root = typeof cwd === 'string' ? slashPath(cwd).replace(/\/+$/, '') : ''
  let target = absolute
  if (root.length > 0 && (absolute.toLowerCase() === root.toLowerCase()
    || absolute.toLowerCase().startsWith(`${root.toLowerCase()}/`))) {
    target = absolute.slice(root.length).replace(/^\/+/, '')
  }
  if (target.length === 0) target = absolute
  const needsQuotes = /[\s"`]/.test(target)
  return needsQuotes ? `@"${target.replace(/"/g, '\\"')}"` : `@${target}`
}

/**
 * Parse a JSON string without throwing.
 * @param text - candidate JSON text.
 * @returns the parsed value, or undefined.
 */
export function parseJson(text) {
  if (typeof text !== 'string' || text.trim().length === 0) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * Collect path strings named by one tool call's arguments.
 * @param toolName - tool name.
 * @param argumentsText - raw JSON arguments string from the session log.
 * @returns candidate paths in source order.
 */
export function pathsFromToolArguments(toolName, argumentsText) {
  if (!PRODUCING_TOOLS.has(toolName)) return []
  const args = parseJson(argumentsText)
  if (typeof args !== 'object' || args === null) return []
  const paths = []
  const push = (value) => {
    if (typeof value === 'string' && value.trim().length > 0) paths.push(value.trim())
  }
  push(args.file_path)
  push(args.filePath)
  push(args.path)
  push(args.target)
  push(args.output)
  if (Array.isArray(args.files)) {
    for (const file of args.files) {
      if (typeof file === 'string') push(file)
      else if (file && typeof file === 'object') push(file.path ?? file.file_path)
    }
  }
  if (Array.isArray(args.paths)) for (const path of args.paths) push(path)
  if (toolName === 'apply_patch' && typeof args.patch === 'string') {
    for (const match of args.patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File:\s*(.+)$/gm)) push(match[1])
  }
  return paths
}

/**
 * Whether a successful call of a tool reads rather than writes.
 * @param toolName - tool name.
 * @returns whether the file was only read.
 */
export function isReadingTool(toolName) {
  return READING_TOOLS.has(toolName)
}

/**
 * Candidate paths from one successful tool result's presentation metadata.
 * @param meta - opaque `tool/result.meta` payload.
 * @returns path strings in source order.
 */
export function pathsFromResultMeta(meta) {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return []
  const paths = []
  const push = (value) => {
    if (typeof value === 'string' && value.trim().length > 0) paths.push(value.trim())
  }
  push(meta.path)
  if (Array.isArray(meta.diffs)) {
    for (const diff of meta.diffs) if (diff && typeof diff === 'object') push(diff.path)
  }
  if (Array.isArray(meta.locations)) {
    for (const location of meta.locations) if (location && typeof location === 'object') push(location.path)
  }
  if (Array.isArray(meta.changes)) {
    for (const change of meta.changes) if (change && typeof change === 'object') push(change.path)
  }
  return paths
}

/**
 * Format a byte count for compact UI text.
 * @param bytes - byte length.
 * @returns a compact size such as `1.2 MB`.
 */
export function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

/** Process-wide case sensitivity for path comparison. */
export const CASE_INSENSITIVE_PATHS = process.platform === 'win32'
