import { Env } from 'hono';
import { ApiKeyManager } from '../../src';

type Environment = Env & {
  Bindings: {
    DB: D1Database;
  };
  Variables: {
    manager: ApiKeyManager;
    apiKey: Awaited<ReturnType<ApiKeyManager['validateKey']>>;
  };
};
