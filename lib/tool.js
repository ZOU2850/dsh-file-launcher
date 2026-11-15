/**
 * The model-facing `file_launcher` tool. It shares the panel's inventory,
 * pin manifest, and archive operation, so the same facts drive both the UI and
 * the agent: list what a conversation produced, recover pinned paths after
 * compaction, and archive selected deliverables.
 *
 * The definition is written as a plain JSON-Schema tool so the bundle needs no
 * package import beyond Node built-ins and its own modules.
 */

import { isAbsolute, resolve } from 'node:path'
import { baseName, CATEGORY_LABELS, formatBytes, referenceText } from './util.js'

/** Format one inventory row for the model. */
function formatRow(file, index) {
  const label = CATEGORY_LABELS[file.category] ?? 'file'
  const facts = [file.source]
  if (file.archived === true) facts.push('archived')
  if (file.reference === true) facts.push('referenced')
  if (typeof file.size === 'number' && file.size > 0) facts.push(formatBytes(file.size))
  const description = typeof file.description === 'string' && file.description.length > 0 ? ` — ${file.description}` : ''
  const shown = file.rel.length > 0 ? file.rel : file.path
  return `${index}. [${label}] ${shown}${description} (${facts.join(', ')})\n   path: ${file.path}`
}

/** Format a verified path list. */
function formatPaths(paths, cwd, verb) {
  if (paths.length === 0) return 'No readable regular files matched.'
  const lines = paths.map((file, index) => `${index + 1}. ${referenceText(file.path, cwd)}\n   path: ${file.path}${typeof file.size === 'number' ? ` (${formatBytes(file.size)})` : ''}`)
  return `${verb} ${paths.length} file${paths.length === 1 ? '' : 's'}:\n${lines.join('\n')}`
}

/**
 * Resolve the Session working directory for one tool call.
 * @param ctx - Host context.
 * @param exec - tool execution.
 * @returns the current working directory, or undefined.
 */
async function workingDirectoryOf(ctx, exec) {
  const workingDirectory = ctx.get('workingDirectory')
  if (workingDirectory !== undefined && exec.agent !== undefined) {
    try {
      return await workingDirectory.ensure(exec.agent, exec.signal)
    } catch {
      // Fall back to the recorded header below.
    }
  }
  return exec.agent?.session?.header?.cwd
}

/**
 * Register the File Launcher tool.
 * @param ctx - Host context with `tools`.
 * @param dependencies - inventory service and pin store.
 * @returns a disposer returned by `ctx.tools.register`.
 */
export function registerTool(ctx, { inventory, store }) {
  return ctx.tools.register({
    name: 'file_launcher',
    description: 'List and manage the files a conversation produced, delivered, read, or received as attachments, '
      + 'and the readable documents in its workspace. Use action "list" to enumerate paths, "sessions" to see recent '
      + 'conversations, "pin"/"unpin" to keep important paths in a durable manifest that survives context compaction, '
      + 'and "archive" to copy files into the user\'s archive folder. The same data appears in the File Launcher panel. '
      + 'The tool returns paths; it does not read file contents.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          description: 'Operation to perform. Defaults to "list".',
          enum: ['list', 'sessions', 'pin', 'unpin', 'archive'],
        },
        scope: {
          type: 'string',
          description: 'For action "list": "session" (all files this conversation produced or received), "sent" (user-attached files across recent projects and conversations), "project" (the conversation plus readable workspace documents), or "pinned". Defaults to "session".',
          enum: ['session', 'sent', 'project', 'pinned'],
        },
        sessionId: {
          type: 'string',
          description: 'Session to inspect. Defaults to the current Session.',
        },
        paths: {
          type: 'array',
          description: 'For action "pin", "unpin", or "archive": file paths. Relative paths resolve against the Session working directory.',
          items: { type: 'string' },
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: 'Maximum files to list (1-200). Defaults to 60.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string' },
        },
        required: ['text'],
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(rawArgs, exec) {
      const args = typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}
      const action = typeof args.action === 'string' ? args.action : 'list'
      const cwd = await workingDirectoryOf(ctx, exec)
      const sessionId = typeof args.sessionId === 'string' && args.sessionId.length > 0
        ? args.sessionId
        : exec.agent?.session?.id
      const limit = typeof args.limit === 'number' && Number.isFinite(args.limit)
        ? Math.max(1, Math.min(200, Math.trunc(args.limit)))
        : 60

      if (action === 'sessions') {
        const sessions = await inventory.listSessions(limit, exec.signal)
        if (sessions.length === 0) return { text: 'No conversations were found.' }
        const lines = sessions.map((session, index) => {
          const title = session.title ?? baseName(session.cwd ?? '') ?? session.id
          return `${index + 1}. ${title}\n   id: ${session.id}${session.cwd === undefined ? '' : `\n   cwd: ${session.cwd}`}`
        })
        return { text: `Recent conversations (${sessions.length}):\n${lines.join('\n')}` }
      }

      if (action === 'pin' || action === 'unpin' || action === 'archive') {
        if (!Array.isArray(args.paths) || args.paths.length === 0) {
          throw new Error(`file_launcher action "${action}" requires a non-empty "paths" array.`)
        }
        const paths = args.paths.map(value => {
          if (typeof value !== 'string' || value.trim().length === 0) throw new Error('Every "paths" entry must be a non-empty string.')
          return value.trim()
        })
        if (action === 'unpin') {
          const before = await store.readPins()
          const candidates = new Set()
          for (const entry of paths) {
            candidates.add(entry)
            if (cwd && !isAbsolute(entry)) candidates.add(resolve(cwd, entry))
            const resolved = await inventory.verifyFile(entry, { cwd, signal: exec.signal })
            if (resolved !== undefined) candidates.add(resolved.path)
          }
          const manifest = await store.removePins([...candidates])
          const removed = Math.max(0, before.pins.length - manifest.pins.length)
          if (removed === 0) {
            return { text: `No matching pinned path was removed. ${manifest.pins.length} pin${manifest.pins.length === 1 ? '' : 's'} remain.` }
          }
          return { text: `Removed ${removed} path${removed === 1 ? '' : 's'} from the pinned list. ${manifest.pins.length} pin${manifest.pins.length === 1 ? '' : 's'} remain.` }
        }
        const { verified, rejected } = await inventory.resolvePaths(paths, cwd, exec.signal)
        if (action === 'pin') {
          const manifest = await store.addPins(verified.map(file => ({
            path: file.path,
            name: baseName(file.path),
            sessionId,
            cwd,
          })))
          const note = rejected.length > 0 ? ` ${rejected.length} path${rejected.length === 1 ? '' : 's'} could not be verified.` : ''
          return { text: `${formatPaths(verified, cwd, 'Pinned')}\nThe manifest now holds ${manifest.pins.length} pin${manifest.pins.length === 1 ? '' : 's'}.${note}` }
        }
        if (verified.length === 0) return { text: 'No readable regular files matched; nothing was archived.' }
        const result = await store.archive(verified.map(file => file.path), exec.signal)
        const copied = result.copied.map(item => `${item.from} -> ${item.to}`)
        const failed = [...result.failed, ...rejected.map(item => ({ path: item.path, message: item.reason }))]
        return {
          text: `Archived ${result.copied.length} file${result.copied.length === 1 ? '' : 's'} to ${result.archiveDir}.`
            + (copied.length > 0 ? `\n${copied.join('\n')}` : '')
            + (failed.length > 0 ? `\nFailed: ${failed.map(item => `${item.path} (${item.message})`).join('; ')}` : ''),
        }
      }

      if (action !== 'list') throw new Error(`Unknown file_launcher action: ${action}`)

      if (args.scope === 'pinned') {
        const manifest = await store.readPins()
        if (!manifest.readable) return { text: 'The pinned-file manifest could not be read.' }
        if (manifest.pins.length === 0) return { text: 'No pinned files yet. Use action "pin" to keep a path across context compaction.' }
        const rows = manifest.pins.slice(0, limit).map((pin, index) => (
          `${index + 1}. ${pin.name}${pin.description === undefined ? '' : ` — ${pin.description}`}\n   path: ${pin.path}${pin.cwd === undefined ? '' : `\n   cwd: ${pin.cwd}`}`
        ))
        return { text: `Pinned files (${manifest.pins.length}):\n${rows.join('\n')}${manifest.pins.length > limit ? `\n... ${manifest.pins.length - limit} more omitted.` : ''}` }
      }

      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        throw new Error('file_launcher needs a Session: call it from a conversation or pass "sessionId".')
      }
      const result = await inventory.inventory({
        sessionId,
        scope: args.scope === 'project' ? 'project' : args.scope === 'sent' ? 'sent' : 'session',
        limit,
        signal: exec.signal,
      })
      if (result.files.length === 0) {
        return { text: `No files found for ${args.scope === 'project' ? 'this conversation and its workspace' : args.scope === 'sent' ? 'recent user-sent files across projects and conversations' : 'this conversation'}.` }
      }
      const summary = Object.entries(result.counts)
        .filter(([key]) => key !== 'all')
        .map(([key, count]) => `${CATEGORY_LABELS[key] ?? key} ${count}`)
        .join(', ')
      const lines = result.files.map((file, index) => formatRow(file, index + 1))
      return {
        text: `${args.scope === 'project' ? 'Conversation and workspace files' : args.scope === 'sent' ? 'Files you sent across projects and conversations' : 'Conversation files'} (${result.files.length}${result.truncated ? ', truncated' : ''}): ${summary}\n${lines.join('\n')}`,
      }
    },
  })
}
