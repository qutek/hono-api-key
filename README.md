# hono-api-key

Hono middleware to validate API keys with optional rate limiting. Includes a simple in-memory adapter and an ergonomic manager for key lifecycle.

## Features

- Middleware-first: `apiKeyMiddleware(manager, options)`
- Header or query authentication (`x-api-key` or `?api_key=` by default)
- Optional per-key or default rate limiting
- Type-safe access to `c.get('apiKey')`
- Pluggable adapters (`src/adapters/*`), ships with in-memory adapter

## Install

```bash
pnpm add hono-api-key
```

Peer dependency: `hono` (v4+)

## Quick Start

```ts
import { Hono } from 'hono'
import { apiKeyMiddleware, ApiKeyManager, MemoryAdapter } from 'hono-api-key'

// Create a manager with an adapter (in-memory shown here)
const manager = new ApiKeyManager({ adapter: new MemoryAdapter() })

// Provision a key
const created = await manager.createKey({ ownerId: 'owner-1', name: 'demo' })

// Protect routes
const app = new Hono<{ Variables: { apiKey: Awaited<ReturnType<typeof manager.validateKey>> } }>()
app.use('*', apiKeyMiddleware(manager))
app.get('/secure', (c) => c.text(`hello ${c.get('apiKey')?.name}`))

// client: set header 'x-api-key: ' + created.key
```

## Middleware

```ts
apiKeyMiddleware(
  manager: ApiKeyManager,
  options?: {
    headerName?: string      // default: 'x-api-key'
    queryName?: string       // default: 'api_key'
    rateLimitBypass?: boolean
  }
)
```

- Throws `HTTPException(401)` for missing/invalid key
- Throws `HTTPException(429)` when rate limit exceeded
- Stores the sanitized key on context: `c.set('apiKey', keyInfo)`

Type helper for app variables:

```ts
type ApiKeyInfo = Awaited<ReturnType<ApiKeyManager['validateKey']>>
const app = new Hono<{ Variables: { apiKey: ApiKeyInfo } }>()
```

## Manager API (selected)

- `createKey({ ownerId, name, permissions?, rateLimit?, expiresAt?, metadata? })`
- `getKeys(ownerId, includeKey=false)`
- `getKeyById(keyId, ownerId?)`
- `updateKey(keyId, ownerId, updates)`
- `deleteKey(keyId, ownerId)`
- `validateKey(keyValue)`
- `checkRateLimit(keyId, override?)`

Records are ISO-string based and sanitized variants omit the `key` field.

## Adapters

Built-in:

- `MemoryAdapter` (`src/adapters/memory.ts`)
- `KvAdapter` (`src/adapters/kv.ts`) – Cloudflare KV

Use Cloudflare KV (Cloudflare Workers):

```ts
import { Hono } from 'hono'
import { apiKeyMiddleware, ApiKeyManager, KvAdapter } from 'hono-api-key'

type Env = { KV: KVNamespace }

const app = new Hono<{
  Bindings: Env
  Variables: {
    apiKey: Awaited<ReturnType<ApiKeyManager['validateKey']>>
    manager: ApiKeyManager
  }
}>()

app.use('*', (c, next) => {
  // Create the manager per request (or share if desired)
  const manager = new ApiKeyManager({ adapter: new KvAdapter(c.env.KV, 'apikey:') })
  c.set('manager', manager)
  return next()
})

// Protect only what you need (e.g., /secure/*)
app.use('/secure/*', (c, next) => apiKeyMiddleware(c.get('manager'))(c, next))

// Unprotected: create an API key
app.post('/create-api-key', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    ownerId?: string
    name?: string
    rateLimit?: { windowMs: number; maxRequests: number } | null
  }
  const key = await c.get('manager').createKey({
    ownerId: body.ownerId ?? 'demo-owner',
    name: body.name ?? 'demo',
    rateLimit: body.rateLimit ?? null,
  })
  return c.json(key)
})

// Protected
app.get('/secure', (c) => c.text('ok'))
```

Notes:

- The second argument `'apikey:'` is an optional namespace prefix for keys stored in KV.
- KV is eventually consistent; avoid relying on strict atomic updates across multiple keys.

Run the KV example locally:

```bash
# Create and configure a KV namespace (copy its id into examples/kv/wrangler.jsonc)
pnpm wrangler kv namespace create KV

# Start the example Worker
pnpm run examples:kv

# Create a key
curl -X POST http://127.0.0.1:8787/create-api-key

# Use the key (query)
curl "http://127.0.0.1:8787/secure?api_key=YOUR_KEY"

# Or with header
curl -H "x-api-key: YOUR_KEY" http://127.0.0.1:8787/secure
```

### Redis Adapter

For Node.js applications, use the Redis adapter:

```typescript
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { apiKeyMiddleware, ApiKeyManager, RedisAdapter } from 'hono-api-key'
import Redis from 'ioredis'

const app = new Hono<{
  Variables: {
    apiKey: Awaited<ReturnType<ApiKeyManager['validateKey']>>
    manager: ApiKeyManager
  }
}>()

// Initialize Redis connection
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

app.use('*', async (c, next) => {
  const manager = new ApiKeyManager({ adapter: new RedisAdapter(redis, 'apikey:') })
  c.set('manager', manager)
  return next()
})

// Protect routes
app.use('/secure/*', (c, next) => apiKeyMiddleware(c.get('manager'))(c, next))

// Create API key
app.post('/create-api-key', async (c) => {
  const body = await c.req.json()
  const key = await c.get('manager').createKey({
    ownerId: body.ownerId ?? 'demo-owner',
    name: body.name ?? 'demo',
    rateLimit: body.rateLimit ?? null,
  })
  return c.json(key)
})

// Protected route
app.get('/secure', (c) => c.json({ ok: true, info: c.get('apiKey') }))

serve({ fetch: app.fetch, port: 3000 })
```

Run the Redis example:

```bash
# Start Redis (Docker)
docker run -p 6379:6379 redis:alpine

# Run the example
pnpm run examples:redis

# Create a key
curl -X POST http://localhost:3000/create-api-key

# Use the key
curl "http://localhost:3000/secure?api_key=YOUR_KEY"
```

Create your own by implementing `StorageAdapter` from `src/types.ts` and pass it to `ApiKeyManager`.

## Examples

- `examples/basic.ts` – Node server with `@hono/node-server`
- `examples/kv/` – Cloudflare Workers KV example (Wrangler)
- `examples/redis/` – Redis adapter example with Node.js

Scripts:

```bash
# Node example
pnpm run examples:basic

# Cloudflare KV example (make sure wrangler is logged in and KV id is set)
pnpm run examples:kv

# Redis example (make sure Redis is running)
pnpm run examples:redis
```

## Development

- Test: `pnpm test`
- Build: `pnpm build`
- Versioning/Changelog: `pnpm changeset`

## License

MIT
