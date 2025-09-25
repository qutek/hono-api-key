# API Key Manager and Middleware for Hono 🔥

Secure, flexible API key middleware and manager for Hono. Works in Node, Cloudflare Workers, and edge runtimes. Batteries included adapters (Memory, KV, Redis) and a clean `StorageAdapter` interface for custom backends.

## Features

- Middleware-first: `apiKeyMiddleware(manager, options?)`
- Header (`x-api-key`) or query (`?api_key=`) auth
- Optional rate limiting (per-key or default)
- Type-safe context: access `c.get('apiKey')`
- Adapters: Memory, Cloudflare KV, Redis; easy to implement your own
- Tiny ESM/CJS builds, Typescript types included

## Install

```bash
pnpm add hono-api-key
```

## Quick Start (Node)

```ts
import { Hono } from 'hono'
import { apiKeyMiddleware, ApiKeyManager, MemoryAdapter } from 'hono-api-key'

const manager = new ApiKeyManager({ adapter: new MemoryAdapter() })
const created = await manager.createKey({ ownerId: 'owner-1', name: 'demo' })

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
    headerName?: string // default: 'x-api-key'
    queryName?: string  // default: 'api_key'
    rateLimitBypass?: boolean
  }
)
```

- Throws `HTTPException(401)` for missing/invalid key
- Throws `HTTPException(429)` when rate limit exceeded
- Stores sanitized key on context: `c.set('apiKey', keyInfo)`

Helper for typing app Variables:

```ts
type ApiKeyInfo = Awaited<ReturnType<ApiKeyManager['validateKey']>>
const app = new Hono<{ Variables: { apiKey: ApiKeyInfo } }>()
```

## Manager API

- `createKey({ ownerId, name, permissions?, rateLimit?, expiresAt?, metadata? })`
- `getKeys(ownerId, includeKey=false)`
- `getKeyById(keyId, ownerId?)`
- `updateKey(keyId, ownerId, updates)`
- `deleteKey(keyId, ownerId)`
- `validateKey(keyValue)`
- `checkRateLimit(keyId, override?)`

Records use ISO strings, sanitized variants omit `key`.

## Adapters

Built-in:

- `MemoryAdapter` – in-memory; great for tests/dev
- `KvAdapter` – Cloudflare Workers KV
- `RedisAdapter` – Redis client-agnostic using a minimal `RedisClient` interface

Implement your own by conforming to `StorageAdapter` in `src/types.ts` and pass it to `ApiKeyManager`.

### Cloudflare KV (Workers)

```ts
import { Hono } from 'hono'
import { apiKeyMiddleware, ApiKeyManager, KvAdapter } from 'hono-api-key'

type Env = { KV: KVNamespace }
const app = new Hono<{ Bindings: Env; Variables: { apiKey: Awaited<ReturnType<ApiKeyManager['validateKey']>>; manager: ApiKeyManager } }>()

app.use('*', (c, next) => {
  const manager = new ApiKeyManager({ adapter: new KvAdapter(c.env.KV, 'apikey:') })
  c.set('manager', manager)
  return next()
})

app.use('/secure/*', (c, n) => apiKeyMiddleware(c.get('manager'))(c, n))
```

KV example is in `examples/kv/` with Wrangler configs and routes.

### Redis (Node or Workers with Upstash / ioredis)

```ts
import { Redis } from '@upstash/redis'
import { apiKeyMiddleware, ApiKeyManager, RedisAdapter } from 'hono-api-key'

const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! })
const manager = new ApiKeyManager({ adapter: new RedisAdapter(redis, 'apikey:') })
```

Redis example is in `examples/redis/` and supports Upstash or ioredis.

## Examples

- `examples/basic.ts` – Node server with `@hono/node-server`
- `examples/kv/` – Cloudflare Workers KV example (Wrangler)
- `examples/redis/` – Redis adapter example (Node/Upstash)
- [examples/custom-d1/](examples/custom-d1/README.md) – Custom adapter on Cloudflare D1 using Drizzle

Scripts:

```bash
# Node example
pnpm run examples:basic

# Cloudflare KV example
pnpm run examples:kv

# Redis example
pnpm run examples:redis
```

## Contributing / Development

```bash
pnpm install
pnpm test           # Vitest
pnpm build          # tsup (ESM+CJS, dts)
pnpm format         # Prettier
pnpm changeset      # create a changeset
```

## Author

Lafif Astahdziq (<https://lafif.me>)
## License

MIT