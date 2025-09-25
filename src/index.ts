import type { MiddlewareHandler } from 'hono';
import type ApiKeyManager from './manager';
import { HTTPException } from 'hono/http-exception';

export function apiKeyMiddleware(
  manager: ApiKeyManager,
  options?: {
    headerName?: string;
    queryName?: string;
    rateLimitBypass?: boolean;
  },
): MiddlewareHandler {
  const headerName = options?.headerName ?? 'x-api-key';
  const queryName = options?.queryName ?? 'api_key';

  return async (c, next) => {
    const apiKey = c.req.header(headerName) || c.req.query(queryName);
    if (!apiKey) throw new HTTPException(401, { message: 'API key is required' });

    const keyInfo = await manager.validateKey(apiKey);
    if (!keyInfo) throw new HTTPException(401, { message: 'Invalid API key' });

    c.set('apiKey', keyInfo);

    if (!options?.rateLimitBypass) {
      const ok = await manager.checkRateLimit(keyInfo.id, keyInfo.rateLimit ?? undefined);
      if (!ok) throw new HTTPException(429, { message: 'Rate limit exceeded' });
    }

    c.set('apiKey', keyInfo);
    await next();
  };
}

export type ApiKeyInfo = ApiKeyManager['validateKey'] extends (
  ...args: unknown[]
) => Promise<infer T>
  ? T
  : never;

export default apiKeyMiddleware;

export * from './types';
export * from './manager';
export * from './adapters/memory';
export * from './adapters/kv';
export * from './adapters/redis';
