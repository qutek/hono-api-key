require('dotenv').config();

import { Hono } from 'hono';
import { apiKeyMiddleware, ApiKeyManager } from '../../../src';
import { contextStorage } from 'hono/context-storage';
import LibsqlAdapter from './utils/adapter-database';
import { Environment } from '../bindings';

const app = new Hono<Environment>();

app.use(contextStorage());

app.use('*', async (c, next) => {
  const manager = new ApiKeyManager({
    adapter: new LibsqlAdapter({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    }),
    prefix: 'db_',
    keyLength: 12,
    rateLimit: { windowMs: 60_000, maxRequests: 10 },
  });
  c.set('manager', manager);
  return next();
});

// Protect only routes under /secure
app.use('/secure/*', (c, n) => apiKeyMiddleware(c.get('manager'))(c, n));

// Create API key (unprotected)
app.post('/create-api-key', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    ownerId?: string;
    name?: string;
    rateLimit?: { windowMs: number; maxRequests: number } | null;
  };
  const manager = c.get('manager');
  const key = await manager.createKey({
    ownerId: body.ownerId ?? 'demo-owner',
    name: body.name ?? 'demo',
    rateLimit: body.rateLimit ?? null,
  });
  return c.json(key);
});

// Protected page
app.all('/secure', (c) => {
  return c.json({ ok: true, info: c.get('apiKey') });
});

app.get('/', (c) => {
  const lines = [
    'hono-api-key Drizzle D1 example',
    '',
    '1) Create a key:',
    '   curl -X POST http://127.0.0.1:8787/create-api-key',
    '',
    '2) Use the key (query):',
    '   curl "http://127.0.0.1:8787/secure?api_key=YOUR_KEY"',
    '',
    '3) Or use header:',
    '   curl -H "x-api-key: YOUR_KEY" http://127.0.0.1:8787/secure',
  ];
  return c.text(lines.join('\n'));
});

export default app;
