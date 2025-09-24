import { describe, it, expect } from 'vitest'
import { KvAdapter } from './kv'
import type { ApiKeyRecord } from '../types'

function createMockKV() {
  const store = new Map<string, string>()
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null
    },
    async put(key: string, value: string) {
      store.set(key, value)
    },
    async delete(key: string) {
      store.delete(key)
    },
  }
}

function sampleRecord(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    id: overrides.id ?? 'id-1',
    key: overrides.key ?? 'key-1',
    ownerId: overrides.ownerId ?? 'owner-1',
    name: overrides.name ?? 'n',
    permissions: overrides.permissions ?? {},
    rateLimit: overrides.rateLimit,
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    lastUsedAt: overrides.lastUsedAt ?? null,
    expiresAt: overrides.expiresAt ?? null,
    metadata: overrides.metadata ?? {},
  }
}

describe('KvAdapter', () => {
  it('saves, reads, lists, updates, deletes', async () => {
    const kv = createMockKV()
    const adapter = new KvAdapter(kv as any, 'test:')

    const rec = sampleRecord()
    await adapter.saveKey(rec)

    const byId = await adapter.getKeyById(rec.id)
    expect(byId?.id).toBe(rec.id)

    const byValue = await adapter.getKeyByValue(rec.key)
    expect(byValue?.id).toBe(rec.id)

    const list = await adapter.getKeysByownerId(rec.ownerId)
    expect(list.map((r) => r.id)).toEqual([rec.id])

    const updated = { ...rec, name: 'new', key: 'key-2' }
    await adapter.updateKey(rec.id, updated)
    const again = await adapter.getKeyByValue('key-2')
    expect(again?.name).toBe('new')

    const deleted = await adapter.deleteKey(rec.id)
    expect(deleted).toBe(true)
    expect(await adapter.getKeyById(rec.id)).toBeNull()
  })

  it('rate limiting works within window', async () => {
    const kv = createMockKV()
    const adapter = new KvAdapter(kv as any, 'test:')
    const rec = sampleRecord({ id: 'r1' })
    await adapter.saveKey(rec)

    const ok1 = await adapter.checkRateLimit('r1', { windowMs: 1000, maxRequests: 1 })
    const ok2 = await adapter.checkRateLimit('r1', { windowMs: 1000, maxRequests: 1 })
    expect(ok1).toBe(true)
    expect(ok2).toBe(false)
  })
})


