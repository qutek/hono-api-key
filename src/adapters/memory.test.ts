import { describe, it, expect } from 'vitest'
import { MemoryAdapter } from './memory'
import type { ApiKeyRecord } from '../types'

function sampleRecord(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    id: overrides.id ?? 'id-1',
    key: overrides.key ?? 'key-1',
    ownerId: overrides.ownerId ?? 'owner-1',
    name: overrides.name ?? 'name',
    permissions: overrides.permissions ?? {},
    rateLimit: overrides.rateLimit,
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    lastUsedAt: overrides.lastUsedAt ?? null,
    expiresAt: overrides.expiresAt ?? null,
    metadata: overrides.metadata ?? {},
  }
}

describe('MemoryAdapter', () => {
  it('saves, reads, lists, updates movements and deletes', async () => {
    const adapter = new MemoryAdapter()
    const rec = sampleRecord()
    await adapter.saveKey(rec)

    expect((await adapter.getKeyById(rec.id))?.id).toBe(rec.id)
    expect((await adapter.getKeyByValue(rec.key))?.id).toBe(rec.id)

    const list = await adapter.getKeysByownerId(rec.ownerId)
    expect(list.length).toBe(1)

    // move owner
    const moved = { ...rec, ownerId: 'owner-2', key: 'key-2' }
    await adapter.updateKey(rec.id, moved)
    expect((await adapter.getKeysByownerId('owner-1')).length).toBe(0)
    expect((await adapter.getKeysByownerId('owner-2')).length).toBe(1)
    expect((await adapter.getKeyByValue('key-2'))?.id).toBe(rec.id)

    // delete
    expect(await adapter.deleteKey(rec.id)).toBe(true)
    expect(await adapter.deleteKey('missing')).toBe(false)
  })

  it('rate limit within window', async () => {
    const adapter = new MemoryAdapter()
    const rec = sampleRecord({ id: 'r1' })
    await adapter.saveKey(rec)
    const ok1 = await adapter.checkRateLimit('r1', { windowMs: 1000, maxRequests: 1 })
    const ok2 = await adapter.checkRateLimit('r1', { windowMs: 1000, maxRequests: 1 })
    expect(ok1).toBe(true)
    expect(ok2).toBe(false)
  })

  it('clear resets all maps', async () => {
    const adapter = new MemoryAdapter()
    await adapter.saveKey(sampleRecord())
    await adapter.clear()
    expect(await adapter.getKeyById('id-1')).toBeNull()
  })
})
