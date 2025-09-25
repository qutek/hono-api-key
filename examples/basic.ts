import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { apiKeyMiddleware, type ApiKeyInfo } from '../src';
import { ApiKeyManager } from '../src/manager';
import { getMemoryAdapter } from '../src/adapters/memory';

async function main() {
  // Configure a manager (in-memory for demo) and register it
  const manager = new ApiKeyManager({
    adapter: getMemoryAdapter(),
    prefix: 'key_',
    keyLength: 12,
    rateLimit: { windowMs: 60_000, maxRequests: 10 },
  });

  // Create a demo key
  const created = await manager.createKey({
    ownerId: 'owner-1',
    name: 'demo',
  });

  console.log('Demo API key:', created.key);

  const app = new Hono<{ Variables: { apiKey: ApiKeyInfo } }>();

  // Protect all routes
  app.use('*', apiKeyMiddleware(manager, { headerName: 'x-api-key' }));

  app.all('/', (c) => {
    const info = c.get('apiKey');
    return c.json({ ok: true, info });
  });

  // Start Node server
  serve(app);

  console.group('Test in browser');
  console.log('Test in browser:', `http://localhost:3000/?api_key=${created.key}`);
  console.log('Rate limit:', '10 requests per minute');
  console.groupEnd();
}

main();
