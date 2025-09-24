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

const app = new Hono<{ Bindings: Env; Variables: { apiKey: Awaited<ReturnType<ApiKeyManager['validateKey']>> } }>()

app.use('*', (c, next) => {
  // Create the manager per request (or share if desired)
  const manager = new ApiKeyManager({ adapter: new KvAdapter(c.env.KV, 'apikey:') })
  c.set('manager', manager)
  return next()
})

app.use('*', (c, next) => apiKeyMiddleware(c.get('manager'))(c, next))

app.get('/secure', (c) => c.text('ok'))
```

Notes:

- The second argument `'apikey:'` is an optional namespace prefix for keys stored in KV.
- KV is eventually consistent; avoid relying on strict atomic updates across multiple keys.

Create your own by implementing `StorageAdapter` from `src/types.ts` and pass it to `ApiKeyManager`.

## Examples

- `examples/basic.ts` – runnable Node server with `@hono/node-server`

Scripts:

```bash
pnpm run examples:basic
```

## Development

- Test: `pnpm test`
- Build: `pnpm build`
- Versioning/Changelog: `pnpm changeset`

## License

MIT
