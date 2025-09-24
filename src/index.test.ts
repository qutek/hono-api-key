import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { apiKeyMiddleware } from './index'
import { ApiKeyManager } from './manager'
import { MemoryAdapter } from './adapters/memory'

describe('apiKey middleware', () => {
  it('rejects when no key is provided', async () => {
    const app = new Hono()
    const manager = new ApiKeyManager({ adapter: new MemoryAdapter() })
    app.use('*', apiKeyMiddleware(manager))
    app.get('/', (c) => c.text('ok'))
    const res = await app.request('/')
    expect(res.status).toBe(401)
  })

  it('accepts valid key from header', async () => {
    const app = new Hono()
    const manager = new ApiKeyManager({ adapter: new MemoryAdapter() })
    const created = await manager.createKey({ ownerId: 'm', name: 'n' })
    const key = created.key
    app.use('*', apiKeyMiddleware(manager))
    app.get('/', (c) => c.text('ok'))
    const res = await app.request('/', { headers: { 'x-api-key': key } })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('accepts valid key from query', async () => {
    const app = new Hono()
    const manager = new ApiKeyManager({ adapter: new MemoryAdapter() })
    const created = await manager.createKey({ ownerId: 'm', name: 'n' })
    const key = created.key
    app.use('*', apiKeyMiddleware(manager, { queryName: 'api_key' }))
    app.get('/', (c) => c.text('ok'))
    const res = await app.request('/?api_key=' + key)
    expect(res.status).toBe(200)
  })

  it('rejects invalid key', async () => {
    const app = new Hono()
    const manager = new ApiKeyManager({ adapter: new MemoryAdapter() })
    app.use('*', apiKeyMiddleware(manager))
    app.get('/', (c) => c.text('ok'))
    const res = await app.request('/', { headers: { 'x-api-key': 'nope' } })
    expect(res.status).toBe(401)
  })
})

