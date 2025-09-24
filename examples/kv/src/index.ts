import { Hono } from 'hono'
import { apiKeyMiddleware, ApiKeyManager, KvAdapter } from '../../../src'

type Env = {
  KV: {
    get: (k: string) => Promise<string | null>
    put: (k: string, v: string) => Promise<void>
    delete: (k: string) => Promise<void>
  }
}

const app = new Hono<{
  Bindings: Env
  Variables: {
    apiKey: Awaited<ReturnType<ApiKeyManager['validateKey']>>
    manager: ApiKeyManager
  }
}>()

app.use('*', async (c, next) => {
  const manager = new ApiKeyManager({ adapter: new KvAdapter(c.env.KV, 'apikey:') })
  c.set('manager', manager)
  return next()
})

// Protect only routes under /secure
app.use('/secure/*', (c, n) => apiKeyMiddleware(c.get('manager'))(c, n))

// Create API key (unprotected)
app.post('/create-api-key', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    ownerId?: string
    name?: string
    rateLimit?: { windowMs: number; maxRequests: number } | null
  }
  const manager = c.get('manager')
  const key = await manager.createKey({
    ownerId: body.ownerId ?? 'demo-owner',
    name: body.name ?? 'demo',
    rateLimit: body.rateLimit ?? null,
  })
  return c.json(key)
})

// Protected page
app.get('/secure', (c) => {
  return c.json({ ok: true, info: c.get('apiKey') })
})

app.get('/', (c) => {
  const lines = [
    'hono-api-key KV example',
    '',
    '1) Create a key:',
    '   curl -X POST http://127.0.0.1:8787/create-api-key',
    '',
    '2) Use the key (query):',
    '   curl "http://127.0.0.1:8787/secure?api_key=YOUR_KEY"',
    '',
    '3) Or use header:',
    '   curl -H "x-api-key: YOUR_KEY" http://127.0.0.1:8787/secure',
  ]
  return c.text(lines.join('\n'))
})

export default app
