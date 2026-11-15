import assert from 'node:assert/strict'
import { InventoryService } from '../lib/inventory.js'

let active = 0
let peak = 0
let reads = 0
let releases = 0
let fail = false
const history = Object.freeze([
  Object.freeze({ type: 'assistant/message', data: { text: 'x'.repeat(1_000_000) } }),
])
const query = {
  async readSession() { throw new Error('Full-history replay must not be used on current DSH.') },
  async observeSession(_id, options) {
    assert.equal(options.projectionMode, 'none')
    options.signal?.throwIfAborted()
    reads += 1
    active += 1
    peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 5))
    return {
      header: { cwd: '/workspace' },
      get events() {
        if (fail) throw new Error('Broken history')
        return history
      },
      [Symbol.dispose]() { active -= 1; releases += 1 },
    }
  },
}
const inventory = new InventoryService({ get: name => name === 'sessionQuery' ? query : undefined }, {})
const shared = await Promise.all(Array.from({ length: 12 }, () => inventory.scanSession('one')))
assert.equal(reads, 1, 'Concurrent refreshes share one observation')
assert.equal(releases, 1)
assert.equal(shared[0].scannedEvents, 1)
assert.ok(shared.every(result => result === shared[0]))
await Promise.all(Array.from({ length: 20 }, (_, i) => inventory.scanSession(`session-${i}`)))
assert.equal(peak, 1, 'Only one history is borrowed at a time')
assert.equal(inventory.scanCache.size, 16, 'History result cache stays bounded')
assert.equal(inventory.scanPending.size, 0)
assert.equal(active, 0)
fail = true
await assert.rejects(inventory.scanSession('broken'), /Broken history/)
assert.equal(active, 0, 'Failed scans release their history lease')
assert.equal(inventory.scanPending.size, 0)
fail = false
await inventory.scanSession('after-failure')
const controller = new AbortController()
controller.abort()
const before = reads
await assert.rejects(inventory.scanSession('cancelled', controller.signal), { name: 'AbortError' })
assert.equal(reads, before, 'Cancelled scans do not load history')
assert.equal(active, 0)
assert.equal(reads, releases)
console.log('PASS: borrowed history, shared refreshes, serial scans, bounded cache, lease cleanup, cancellation')
