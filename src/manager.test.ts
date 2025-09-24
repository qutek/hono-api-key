import { describe, it, expect } from 'vitest'
import { ApiKeyManager } from './manager'
import { MemoryAdapter } from './adapters/memory'

describe('ApiKeyManager', () => {
  it('creates, fetches, validates and deletes keys', async () => {
    const adapter = new MemoryAdapter()
    const manager = new ApiKeyManager({ adapter, prefix: 'popme_' })

    const created = await manager.createKey({ ownerId: 'm1', name: 'test' })
    expect(created.id).toBeTruthy()
    expect(created.key).toMatch(/^popme_/)

    const listed = await manager.getKeys('m1')
    expect(listed.length).toBe(1)
    expect((listed[0] as any).key).toBeUndefined()

    const validated = await manager.validateKey(created.key)
    expect(validated?.id).toBe(created.id)

    const byId = await manager.getKeyById(created.id, 'm1')
    expect(byId?.id).toBe(created.id)

    const updated = await manager.updateKey(created.id, 'm1', { name: 'new' })
    expect(updated?.name).toBe('new')

    const deleted = await manager.deleteKey(created.id, 'm1')
    expect(deleted).toBe(true)
  })
})

