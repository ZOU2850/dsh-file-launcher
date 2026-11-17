/**
 * File Launcher for DeepSeek Harness — Host half.
 *
 * The browser panel, the `file_launcher` agent tool, and the authenticated
 * Fetch routes all use the same inventory service and pin/archive store.
 */

import { createRequire } from 'node:module'
import { InventoryService } from './lib/inventory.js'
import { FileLauncherStore } from './lib/store.js'
import { registerRoutes } from './lib/routes.js'
import { registerTool } from './lib/tool.js'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')

/** Loader identity. */
export const name = 'file-launcher'

/** Host services the plugin needs; `connection` and `sessionQuery` ship with the Web profile. */
export const inject = ['tools', 'fs', 'sessionQuery', 'connection']

/** Package version reported by the health route and the plugin detail document. */
export const VERSION = typeof pkg?.version === 'string' ? pkg.version : '1.4.9'

/** Normalize a Cordis registration result (function or `{ dispose }`) into a cleanup callback. */
function toDisposer(disposable) {
  if (typeof disposable === 'function') return disposable
  if (disposable && typeof disposable.dispose === 'function') return () => disposable.dispose()
  return () => {}
}

/**
 * Register the tool, the routes, and their shared services.
 * @param ctx - Host context.
 */
export function apply(ctx) {
  const store = new FileLauncherStore(ctx)
  const inventory = new InventoryService(ctx, store)
  ctx.effect(() => {
    const disposers = [
      toDisposer(registerTool(ctx, { inventory, store })),
      toDisposer(registerRoutes(ctx, { inventory, store, version: VERSION })),
    ]
    return () => {
      try {
        inventory.dispose?.()
      } catch {
        // Ignore teardown errors during hot reload or host shutdown.
      }
      for (const dispose of disposers.splice(0).reverse()) {
        try {
          dispose()
        } catch {
          // Ignore teardown errors during hot reload or host shutdown.
        }
      }
    }
  })
  // Build the persisted sent index lazily when the user opens that scope.
  // Startup must not replay every recent conversation before the UI is ready.
}

export default { apply, inject, name }
