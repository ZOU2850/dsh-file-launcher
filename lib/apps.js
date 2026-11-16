/**
 * Local desktop application discovery and extension-aware matching.
 * Combines common install locations, Windows Registry `App Paths`, and
 * per-extension `OpenWithProgids` / `UserChoice` lookups with strict
 * extension allowlists so irrelevant programs are never offered.
 */

import { execFile, spawn } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { access, readdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const APPS_CACHE_TTL_MS = 60_000
const EXT_CACHE_TTL_MS = 60_000
const REG_TIMEOUT_MS = 1_800

/** Extension -> prioritized curated application IDs (keeps unrelated apps out). */
export const EXT_APP_MAP = {
  '.docx': ['word', 'wps-wps', 'wps'],
  '.doc': ['word', 'wps-wps', 'wps'],
  '.odt': ['word', 'wps-wps', 'wps'],
  '.wps': ['wps-wps', 'wps', 'word'],
  '.rtf': ['word', 'wps-wps', 'wps', 'notepadpp', 'notepad'],
  '.xlsx': ['excel', 'wps-et', 'wps'],
  '.xls': ['excel', 'wps-et', 'wps'],
  '.xlsm': ['excel', 'wps-et', 'wps'],
  '.ods': ['excel', 'wps-et', 'wps'],
  '.et': ['wps-et', 'wps', 'excel'],
  '.csv': ['excel', 'wps-et', 'wps', 'vscode', 'cursor', 'notepadpp', 'notepad'],
  '.tsv': ['excel', 'wps-et', 'wps', 'vscode', 'cursor', 'notepadpp', 'notepad'],
  '.pptx': ['powerpoint', 'wps-wpp', 'wps'],
  '.ppt': ['powerpoint', 'wps-wpp', 'wps'],
  '.odp': ['powerpoint', 'wps-wpp', 'wps'],
  '.dps': ['wps-wpp', 'wps', 'powerpoint'],
  '.pdf': ['edge', 'chrome', 'firefox', 'wps-pdf', 'wps', 'acrobat', 'sumatrapdf', 'foxit'],
  '.md': ['typora', 'obsidian', 'vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad', 'word', 'wps-wps'],
  '.mdx': ['vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad'],
  '.markdown': ['typora', 'obsidian', 'vscode', 'cursor', 'trae', 'notepadpp', 'notepad', 'word', 'wps-wps'],
  '.txt': ['notepad', 'notepadpp', 'vscode', 'cursor', 'trae'],
  '.log': ['notepadpp', 'notepad', 'vscode', 'cursor'],
  '.ini': ['notepad', 'notepadpp', 'vscode', 'cursor'],
  '.conf': ['notepad', 'notepadpp', 'vscode', 'cursor'],
  '.cfg': ['notepad', 'notepadpp', 'vscode', 'cursor'],
  '.env': ['vscode', 'cursor', 'notepadpp', 'notepad'],
  '.html': ['edge', 'chrome', 'firefox', 'vscode', 'cursor', 'notepad'],
  '.htm': ['edge', 'chrome', 'firefox', 'vscode', 'cursor', 'notepad'],
  '.svg': ['edge', 'chrome', 'firefox', 'vscode', 'cursor', 'notepad'],
  '.png': ['photos', 'edge', 'chrome', 'mspaint'],
  '.jpg': ['photos', 'edge', 'chrome', 'mspaint'],
  '.jpeg': ['photos', 'edge', 'chrome', 'mspaint'],
  '.webp': ['photos', 'edge', 'chrome'],
  '.gif': ['photos', 'edge', 'chrome'],
  '.bmp': ['photos', 'mspaint', 'edge', 'chrome'],
  '.ico': ['photos', 'edge', 'chrome'],
  '.avif': ['edge', 'chrome'],
  '.tif': ['photos', 'mspaint'],
  '.tiff': ['photos', 'mspaint'],
  '.zip': ['bandizip', 'winrar', '7zip'],
  '.7z': ['7zip', 'bandizip', 'winrar'],
  '.rar': ['winrar', 'bandizip', '7zip'],
  '.tar': ['7zip', 'bandizip', 'winrar'],
  '.gz': ['7zip', 'bandizip', 'winrar'],
  '.tgz': ['7zip', 'bandizip', 'winrar'],
  '.py': ['vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad'],
  '.js': ['vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad'],
  '.jsx': ['vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad'],
  '.mjs': ['vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad'],
  '.cjs': ['vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad'],
  '.ts': ['vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad'],
  '.tsx': ['vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad'],
  '.css': ['vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad'],
  '.scss': ['vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad'],
  '.less': ['vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad'],
  '.json': ['vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad'],
  '.jsonc': ['vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad'],
  '.jsonl': ['vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad'],
  '.yaml': ['vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad'],
  '.yml': ['vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad'],
  '.toml': ['vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad'],
  '.xml': ['vscode', 'cursor', 'edge', 'notepadpp', 'notepad'],
  '.sql': ['vscode', 'cursor', 'trae', 'notepadpp', 'notepad'],
  '.sh': ['vscode', 'cursor', 'trae', 'notepadpp', 'notepad'],
  '.ps1': ['vscode', 'cursor', 'trae', 'notepadpp', 'notepad'],
  '.bat': ['notepad', 'notepadpp', 'vscode'],
  '.cmd': ['notepad', 'notepadpp', 'vscode'],
}

const DEFAULT_FALLBACK_APP_IDS = ['vscode', 'cursor', 'trae', 'windsurf', 'notepadpp', 'notepad']

/** Friendly names keyed by lowercase exe name (and optional WPS sub-mode). */
const EXE_FRIENDLY_NAMES = new Map([
  ['winword.exe', 'Microsoft Word'],
  ['excel.exe', 'Microsoft Excel'],
  ['powerpnt.exe', 'Microsoft PowerPoint'],
  ['wps.exe|/wps', 'WPS 文字'],
  ['wps.exe|/et', 'WPS 表格'],
  ['wps.exe|/wpp', 'WPS 演示'],
  ['wps.exe|/pdf', 'WPS PDF'],
  ['wps.exe', 'WPS Office'],
  ['et.exe', 'WPS 表格'],
  ['wpp.exe', 'WPS 演示'],
  ['ksolaunch.exe', 'WPS Office'],
  ['code.exe', 'VS Code'],
  ['cursor.exe', 'Cursor'],
  ['trae.exe', 'Trae'],
  ['windsurf.exe', 'Windsurf'],
  ['typora.exe', 'Typora'],
  ['obsidian.exe', 'Obsidian'],
  ['notepad++.exe', 'Notepad++'],
  ['notepad.exe', '记事本'],
  ['msedge.exe', 'Microsoft Edge'],
  ['chrome.exe', 'Google Chrome'],
  ['firefox.exe', 'Firefox'],
  ['acrobat.exe', 'Adobe Acrobat'],
  ['acrord32.exe', 'Adobe Reader'],
  ['sumatrapdf.exe', 'SumatraPDF'],
  ['foxitpdfreader.exe', 'Foxit PDF Reader'],
  ['foxitreader.exe', 'Foxit Reader'],
  ['7zfm.exe', '7-Zip'],
  ['winrar.exe', 'WinRAR'],
  ['bandizip.exe', 'Bandizip'],
  ['mspaint.exe', '画图'],
  ['photolaunch.exe', 'WPS 看图'],
  ['workbuddy.exe', 'WorkBuddy'],
])

const IGNORED_REGISTRY_EXES = new Set([
  'cmd.exe',
  'powershell.exe',
  'pwsh.exe',
  'conhost.exe',
  'rundll32.exe',
  'explorer.exe',
  'openwith.exe',
  'dsh.exe',
  'node.exe',
  'wscript.exe',
  'cscript.exe',
])

async function isExecutableFile(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return false
  try {
    await access(filePath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

function expandWinEnv(raw) {
  if (typeof raw !== 'string') return ''
  return raw.replace(/%([^%]+)%/g, (full, key) => process.env[key] ?? full)
}

function tokenizeCommandLine(command) {
  const tokens = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && /\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }
  if (current.length > 0) tokens.push(current)
  return tokens
}

function parseShellOpenCommand(command) {
  const expanded = expandWinEnv(String(command || '').trim())
  if (expanded.length === 0) return undefined
  const tokens = tokenizeCommandLine(expanded)
  if (tokens.length === 0) return undefined
  const exe = tokens[0]
  if (!/\.exe$/i.test(exe)) return undefined
  const rawArgs = tokens.slice(1)
  const hasPlaceholder = rawArgs.some(arg => /%[1*lL]/.test(arg))
  const buildArgs = (targetPath) => {
    if (!hasPlaceholder) return [...rawArgs, targetPath]
    return rawArgs.map(arg => arg.replace(/%[1*lL]/g, targetPath))
  }
  const wpsMode = rawArgs.find(arg => /^\/(?:wps|et|wpp|pdf)$/i.test(arg))?.toLowerCase()
  return { exe, rawArgs, wpsMode, buildArgs }
}

async function regQuery(keyPath, valueFlag) {
  try {
    const args = ['query', keyPath, ...(valueFlag ? [valueFlag] : [])]
    const { stdout } = await execFileAsync('reg', args, {
      encoding: 'utf8',
      timeout: REG_TIMEOUT_MS,
      windowsHide: true,
    })
    return stdout || ''
  } catch {
    return ''
  }
}

let winAppPathsCache

async function loadWinAppPathsMap() {
  if (winAppPathsCache !== undefined && Date.now() - winAppPathsCache.at < APPS_CACHE_TTL_MS) {
    return winAppPathsCache.map
  }
  const map = new Map()
  const outputs = await Promise.all([
    regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths', '/s'),
    regQuery('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths', '/s'),
  ])
  for (const out of outputs) {
    let currentExe = ''
    for (const rawLine of out.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line) continue
      if (/^HKEY_/i.test(line)) {
        const idx = line.toLowerCase().lastIndexOf('\\app paths\\')
        currentExe = idx >= 0 ? line.slice(idx + '\\app paths\\'.length).trim().toLowerCase() : ''
        continue
      }
      if (!currentExe || map.has(currentExe)) continue
      if (/^(?:Path|UseUrl|DropTarget|DontUseDesktopChangeRouter)\s+/i.test(line)) continue
      const match = /^[^\s]+\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)/i.exec(line)
      if (!match) continue
      const candidate = expandWinEnv(match[1].trim().replace(/^"+|"+$/g, ''))
      if (candidate && /\.exe$/i.test(candidate)) {
        map.set(currentExe, candidate)
      }
    }
  }
  winAppPathsCache = { at: Date.now(), map }
  return map
}

async function queryWinAppPath(exeName, batchMap) {
  const key = String(exeName || '').trim().toLowerCase()
  if (batchMap && key && batchMap.has(key)) {
    const candidate = batchMap.get(key)
    if (await isExecutableFile(candidate)) return candidate
  }
  if (batchMap !== undefined) return undefined
  for (const root of ['HKCU', 'HKLM']) {
    const out = await regQuery(`${root}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`, '/ve')
    const match = /REG_(?:SZ|EXPAND_SZ)\s+(.+)/i.exec(out)
    if (!match) continue
    const candidate = expandWinEnv(match[1].trim().replace(/^"+|"+$/g, ''))
    if (await isExecutableFile(candidate)) return candidate
  }
  return undefined
}

async function findWpsRootExecutables() {
  const localApp = process.env.LOCALAPPDATA || ''
  const prog = process.env.ProgramFiles || 'C:\\Program Files'
  const prog86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const roots = [
    join(localApp, 'Kingsoft', 'WPS Office'),
    join(prog, 'Kingsoft', 'WPS Office'),
    join(prog86, 'Kingsoft', 'WPS Office'),
  ]
  const found = { launcher: undefined, wpsExe: undefined }
  for (const dir of roots) {
    const kso = join(dir, 'ksolaunch.exe')
    if (found.launcher === undefined && await isExecutableFile(kso)) found.launcher = kso
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      const versions = entries
        .filter(e => e.isDirectory() && /^\d+(?:\.\d+)+$/.test(e.name))
        .map(e => e.name)
        .sort()
        .reverse()
      for (const ver of versions) {
        const candidate = join(dir, ver, 'office6', 'wps.exe')
        if (await isExecutableFile(candidate)) {
          found.wpsExe = candidate
          break
        }
      }
      if (found.wpsExe === undefined) {
        const direct = join(dir, 'office6', 'wps.exe')
        if (await isExecutableFile(direct)) found.wpsExe = direct
      }
    } catch {}
    if (found.wpsExe !== undefined) break
  }
  return found
}

function friendlyNameForExe(exePath, wpsMode, fallbackLabel) {
  const base = basename(exePath).toLowerCase()
  if (wpsMode && EXE_FRIENDLY_NAMES.has(`${base}|${wpsMode}`)) {
    return EXE_FRIENDLY_NAMES.get(`${base}|${wpsMode}`)
  }
  if (EXE_FRIENDLY_NAMES.has(base)) return EXE_FRIENDLY_NAMES.get(base)
  if (fallbackLabel) return fallbackLabel
  return basename(exePath).replace(/\.exe$/i, '')
}

export class LocalAppDetector {
  constructor() {
    this.appsCache = undefined
    this.appsPending = undefined
    this.extCache = new Map()
    this.registryById = new Map()
  }

  /** Detect installed desktop applications (cached for 60s). */
  async detectInstalledApps() {
    if (this.appsCache !== undefined && Date.now() - this.appsCache.at < APPS_CACHE_TTL_MS) {
      return this.appsCache.list
    }
    if (this.appsPending !== undefined) return this.appsPending

    this.appsPending = (async () => {
      const detected = []
      if (process.platform === 'win32') {
        const localApp = process.env.LOCALAPPDATA || ''
        const prog = process.env.ProgramFiles || 'C:\\Program Files'
        const prog86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
        const sysRoot = process.env.SystemRoot || 'C:\\Windows'

        const candidates = [
          {
            id: 'word', name: 'Microsoft Word', regExe: 'WINWORD.EXE',
            paths: [
              join(prog, 'Microsoft Office', 'Root', 'Office16', 'WINWORD.EXE'),
              join(prog86, 'Microsoft Office', 'Root', 'Office16', 'WINWORD.EXE'),
              join(prog, 'Microsoft Office', 'Office16', 'WINWORD.EXE'),
              join(prog86, 'Microsoft Office', 'Office16', 'WINWORD.EXE'),
              join(prog, 'Microsoft Office', 'Office15', 'WINWORD.EXE'),
            ],
          },
          {
            id: 'excel', name: 'Microsoft Excel', regExe: 'EXCEL.EXE',
            paths: [
              join(prog, 'Microsoft Office', 'Root', 'Office16', 'EXCEL.EXE'),
              join(prog86, 'Microsoft Office', 'Root', 'Office16', 'EXCEL.EXE'),
              join(prog, 'Microsoft Office', 'Office16', 'EXCEL.EXE'),
              join(prog86, 'Microsoft Office', 'Office16', 'EXCEL.EXE'),
              join(prog, 'Microsoft Office', 'Office15', 'EXCEL.EXE'),
            ],
          },
          {
            id: 'powerpoint', name: 'Microsoft PowerPoint', regExe: 'POWERPNT.EXE',
            paths: [
              join(prog, 'Microsoft Office', 'Root', 'Office16', 'POWERPNT.EXE'),
              join(prog86, 'Microsoft Office', 'Root', 'Office16', 'POWERPNT.EXE'),
              join(prog, 'Microsoft Office', 'Office16', 'POWERPNT.EXE'),
              join(prog86, 'Microsoft Office', 'Office16', 'POWERPNT.EXE'),
              join(prog, 'Microsoft Office', 'Office15', 'POWERPNT.EXE'),
            ],
          },
          {
            id: 'vscode', name: 'VS Code', regExe: 'Code.exe',
            paths: [
              join(localApp, 'Programs', 'Microsoft VS Code', 'Code.exe'),
              join(prog, 'Microsoft VS Code', 'Code.exe'),
              'D:\\Program Files\\Microsoft VS Code\\Code.exe',
            ],
          },
          {
            id: 'cursor', name: 'Cursor', regExe: 'Cursor.exe',
            paths: [
              join(localApp, 'Programs', 'cursor', 'Cursor.exe'),
              join(localApp, 'Programs', 'Cursor', 'Cursor.exe'),
            ],
          },
          {
            id: 'trae', name: 'Trae', regExe: 'Trae.exe',
            paths: [
              join(localApp, 'Programs', 'Trae', 'Trae.exe'),
              join(localApp, 'Programs', 'Trae CN', 'Trae CN.exe'),
            ],
          },
          {
            id: 'windsurf', name: 'Windsurf', regExe: 'Windsurf.exe',
            paths: [join(localApp, 'Programs', 'Windsurf', 'Windsurf.exe')],
          },
          {
            id: 'typora', name: 'Typora', regExe: 'Typora.exe',
            paths: [
              join(prog, 'Typora', 'Typora.exe'),
              join(localApp, 'Programs', 'Typora', 'Typora.exe'),
            ],
          },
          {
            id: 'obsidian', name: 'Obsidian', regExe: 'Obsidian.exe',
            paths: [
              join(localApp, 'Programs', 'Obsidian', 'Obsidian.exe'),
              join(localApp, 'Obsidian', 'Obsidian.exe'),
            ],
          },
          {
            id: 'notepadpp', name: 'Notepad++', regExe: 'notepad++.exe',
            paths: [
              join(prog, 'Notepad++', 'notepad++.exe'),
              join(prog86, 'Notepad++', 'notepad++.exe'),
              'D:\\Program Files\\Notepad++\\notepad++.exe',
            ],
          },
          {
            id: 'edge', name: 'Microsoft Edge', regExe: 'msedge.exe',
            paths: [
              join(prog86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
              join(prog, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            ],
          },
          {
            id: 'chrome', name: 'Google Chrome', regExe: 'chrome.exe',
            paths: [
              join(prog, 'Google', 'Chrome', 'Application', 'chrome.exe'),
              join(prog86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
              join(localApp, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            ],
          },
          {
            id: 'firefox', name: 'Firefox', regExe: 'firefox.exe',
            paths: [
              join(prog, 'Mozilla Firefox', 'firefox.exe'),
              join(prog86, 'Mozilla Firefox', 'firefox.exe'),
            ],
          },
          {
            id: 'acrobat', name: 'Adobe Acrobat / Reader', regExe: 'Acrobat.exe',
            paths: [
              join(prog, 'Adobe', 'Acrobat DC', 'Acrobat', 'Acrobat.exe'),
              join(prog86, 'Adobe', 'Acrobat Reader DC', 'Reader', 'AcroRd32.exe'),
            ],
          },
          {
            id: 'sumatrapdf', name: 'SumatraPDF', regExe: 'SumatraPDF.exe',
            paths: [
              join(localApp, 'SumatraPDF', 'SumatraPDF.exe'),
              join(prog, 'SumatraPDF', 'SumatraPDF.exe'),
            ],
          },
          {
            id: 'foxit', name: 'Foxit PDF Reader', regExe: 'FoxitPDFReader.exe',
            paths: [
              join(prog, 'Foxit Software', 'Foxit PDF Reader', 'FoxitPDFReader.exe'),
              join(prog86, 'Foxit Software', 'Foxit PDF Reader', 'FoxitPDFReader.exe'),
            ],
          },
          {
            id: '7zip', name: '7-Zip', regExe: '7zFM.exe',
            paths: [join(prog, '7-Zip', '7zFM.exe'), join(prog86, '7-Zip', '7zFM.exe')],
          },
          {
            id: 'winrar', name: 'WinRAR', regExe: 'WinRAR.exe',
            paths: [join(prog, 'WinRAR', 'WinRAR.exe'), join(prog86, 'WinRAR', 'WinRAR.exe')],
          },
          {
            id: 'bandizip', name: 'Bandizip', regExe: 'Bandizip.exe',
            paths: [join(prog, 'Bandizip', 'Bandizip.exe'), join(prog86, 'Bandizip', 'Bandizip.exe')],
          },
          {
            id: 'mspaint', name: '画图 (Paint)',
            paths: [join(sysRoot, 'System32', 'mspaint.exe')],
          },
          {
            id: 'notepad', name: '记事本 (Notepad)', regExe: 'notepad.exe',
            paths: [
              join(sysRoot, 'System32', 'notepad.exe'),
              join(sysRoot, 'notepad.exe'),
            ],
          },
        ]

        const appPathsMap = await loadWinAppPathsMap()
        const resolvedList = await Promise.all(candidates.map(async spec => {
          for (const candidate of spec.paths) {
            if (await isExecutableFile(candidate)) {
              return { id: spec.id, name: spec.name, exe: candidate, buildArgs: filePath => [filePath] }
            }
          }
          if (spec.regExe) {
            const fromReg = await queryWinAppPath(spec.regExe, appPathsMap)
            if (fromReg) return { id: spec.id, name: spec.name, exe: fromReg, buildArgs: filePath => [filePath] }
          }
          return undefined
        }))
        for (const item of resolvedList) {
          if (item !== undefined) detected.push(item)
        }

        // WPS Office (often registered via HKCU App Paths or versioned `office6\wps.exe`).
        const [wpsRegExe, wpsFiles] = await Promise.all([
          queryWinAppPath('wps.exe', appPathsMap),
          findWpsRootExecutables(),
        ])
        const wpsExe = wpsRegExe || wpsFiles.wpsExe
        if (wpsExe) {
          detected.push(
            { id: 'wps-wps', name: 'WPS 文字', exe: wpsExe, buildArgs: filePath => ['/prometheus', '/wps', filePath] },
            { id: 'wps-et', name: 'WPS 表格', exe: wpsExe, buildArgs: filePath => ['/prometheus', '/et', filePath] },
            { id: 'wps-wpp', name: 'WPS 演示', exe: wpsExe, buildArgs: filePath => ['/prometheus', '/wpp', filePath] },
            { id: 'wps-pdf', name: 'WPS PDF', exe: wpsExe, buildArgs: filePath => ['/prometheus', '/pdf', filePath] },
          )
        }
        if (wpsFiles.launcher) {
          detected.push({ id: 'wps', name: 'WPS Office', exe: wpsFiles.launcher, buildArgs: filePath => [filePath] })
        }
      } else if (process.platform === 'darwin') {
        const macCandidates = [
          { id: 'word', name: 'Microsoft Word', app: '/Applications/Microsoft Word.app' },
          { id: 'excel', name: 'Microsoft Excel', app: '/Applications/Microsoft Excel.app' },
          { id: 'powerpoint', name: 'Microsoft PowerPoint', app: '/Applications/Microsoft PowerPoint.app' },
          { id: 'wps', name: 'WPS Office', app: '/Applications/wpsoffice.app' },
          { id: 'vscode', name: 'VS Code', app: '/Applications/Visual Studio Code.app' },
          { id: 'cursor', name: 'Cursor', app: '/Applications/Cursor.app' },
          { id: 'typora', name: 'Typora', app: '/Applications/Typora.app' },
          { id: 'chrome', name: 'Google Chrome', app: '/Applications/Google Chrome.app' },
          { id: 'notepad', name: 'TextEdit', app: '/System/Applications/TextEdit.app' },
        ]
        for (const item of macCandidates) {
          if (await isExecutableFile(item.app)) {
            detected.push({ id: item.id, name: item.name, exe: 'open', buildArgs: filePath => ['-a', item.app, filePath] })
          }
        }
      }

      for (const app of detected) this.registryById.set(app.id, app)
      this.appsCache = { at: Date.now(), list: detected }
      return detected
    })()

    try {
      return await this.appsPending
    } finally {
      this.appsPending = undefined
    }
  }

  /** Inspect Windows Explorer FileExts registry for an exact extension. */
  async detectWinRegistryAppsForExt(ext) {
    if (process.platform !== 'win32' || !ext) return { defaultExeKey: '', apps: [] }
    const normExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
    const cached = this.extCache.get(normExt)
    if (cached !== undefined && Date.now() - cached.at < EXT_CACHE_TTL_MS) return cached.value

    const progIds = []
    let userChoiceProgId = ''
    const [ucLatestOut, ucLegacyOut, owpOut, clsOut, hklmClsOut] = await Promise.all([
      regQuery(`HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\${normExt}\\UserChoiceLatest`, '/v ProgId'),
      regQuery(`HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\${normExt}\\UserChoice`, '/v ProgId'),
      regQuery(`HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\${normExt}\\OpenWithProgids`),
      regQuery(`HKCU\\Software\\Classes\\${normExt}`, '/ve'),
      regQuery(`HKLM\\SOFTWARE\\Classes\\${normExt}`, '/ve'),
    ])
    for (const userChoiceOut of [ucLatestOut, ucLegacyOut]) {
      const ucMatch = /ProgId\s+REG_SZ\s+(\S+)/i.exec(userChoiceOut)
      if (ucMatch) {
        userChoiceProgId = ucMatch[1].trim()
        progIds.push(userChoiceProgId)
        break
      }
    }

    for (const line of owpOut.split(/\r?\n/)) {
      const m = /^\s{4}([^\s]+)\s+REG_/i.exec(line)
      if (m && !progIds.includes(m[1])) progIds.push(m[1])
    }

    for (const txt of [clsOut, hklmClsOut]) {
      const m = /REG_SZ\s+(\S+)/i.exec(txt)
      if (m && !progIds.includes(m[1])) progIds.push(m[1])
    }

    const topProgIds = progIds.slice(0, 10)
    const cmdResults = await Promise.all(topProgIds.map(async progId => {
      const [hkcuOut, hklmOut] = await Promise.all([
        regQuery(`HKCU\\Software\\Classes\\${progId}\\shell\\open\\command`, '/ve'),
        regQuery(`HKLM\\SOFTWARE\\Classes\\${progId}\\shell\\open\\command`, '/ve'),
      ])
      return { progId, cmdOut: /REG_(?:SZ|EXPAND_SZ)/i.test(hkcuOut) ? hkcuOut : hklmOut }
    }))

    const apps = []
    let defaultExeKey = ''
    for (const { progId, cmdOut } of cmdResults) {
      const cmdMatch = /REG_(?:SZ|EXPAND_SZ)\s+(.+)/i.exec(cmdOut)
      if (!cmdMatch) continue
      const parsed = parseShellOpenCommand(cmdMatch[1])
      if (!parsed) continue
      const exeBase = basename(parsed.exe).toLowerCase()
      if (IGNORED_REGISTRY_EXES.has(exeBase)) continue
      if (!(await isExecutableFile(parsed.exe))) continue
      const exeKey = `${exeBase}|${parsed.wpsMode || ''}`
      if (userChoiceProgId && progId === userChoiceProgId) defaultExeKey = exeKey
      const id = `reg:${progId}`
      const entry = {
        id,
        name: friendlyNameForExe(parsed.exe, parsed.wpsMode, progId),
        exe: parsed.exe,
        exeKey,
        default: Boolean(userChoiceProgId && progId === userChoiceProgId),
        buildArgs: parsed.buildArgs,
      }
      this.registryById.set(id, entry)
      apps.push(entry)
    }

    const value = { defaultExeKey, apps }
    this.extCache.set(normExt, { at: Date.now(), value })
    while (this.extCache.size > 48) this.extCache.delete(this.extCache.keys().next().value)
    return value
  }

  /** Match installed and registry-discovered apps for one file path. */
  async matchAppsForPath(filePath) {
    const ext = extname(String(filePath || '')).toLowerCase()
    const [installed, regResult] = await Promise.all([
      this.detectInstalledApps(),
      this.detectWinRegistryAppsForExt(ext),
    ])
    const installedById = new Map(installed.map(app => [app.id, app]))
    const allowedIds = EXT_APP_MAP[ext] || DEFAULT_FALLBACK_APP_IDS
    const out = []
    const seenExeKeys = new Set()
    const seenNames = new Set()

    const pushApp = (app, isDefault = false) => {
      const exeKey = app.exeKey || `${basename(app.exe).toLowerCase()}|${app.id.startsWith('wps-') ? `/${app.id.slice(4)}` : ''}`
      const normName = app.name.toLowerCase()
      if (seenExeKeys.has(exeKey) || seenNames.has(normName)) return
      seenExeKeys.add(exeKey)
      seenNames.add(normName)
      out.push({
        id: app.id,
        name: app.name,
        exe: app.exe,
        ...(isDefault || (regResult.defaultExeKey && regResult.defaultExeKey === exeKey) ? { default: true } : {}),
      })
    }

    // Put Windows default registry app first when found, followed by curated ext matches, then remaining registry associations.
    for (const regApp of regResult.apps) {
      if (regApp.default) pushApp(regApp, true)
    }
    for (const aid of allowedIds) {
      const app = installedById.get(aid)
      if (app !== undefined) pushApp(app, false)
    }
    for (const regApp of regResult.apps) {
      pushApp(regApp, regApp.default)
    }

    // Guarantee `wps` launcher fallback does not duplicate specific WPS modes when already shown.
    if (out.some(a => a.id.startsWith('wps-'))) {
      const filtered = out.filter(a => a.id !== 'wps')
      filtered.sort((a, b) => (b.default ? 1 : 0) - (a.default ? 1 : 0))
      return filtered
    }
    out.sort((a, b) => (b.default ? 1 : 0) - (a.default ? 1 : 0))
    return out
  }

  /** Launch a file using a validated, previously detected app ID. */
  async launchWithApp(appId, filePath) {
    if (typeof appId !== 'string' || appId.length === 0) return false
    if (!this.registryById.has(appId)) await this.matchAppsForPath(filePath)
    const entry = this.registryById.get(appId)
    if (entry === undefined) return false
    const args = entry.buildArgs(filePath)
    const child = spawn(entry.exe, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.on('error', () => {})
    child.unref()
    return true
  }
}
