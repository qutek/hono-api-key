import { Env } from 'hono'
import { RedisClient, ApiKeyManager } from '../../src'

type Environment = Env & {
  Bindings: {
    REDIS_URL: string
    UPSTASH_REDIS_REST_URL: string
    UPSTASH_REDIS_REST_TOKEN: string
  }
  Variables: {
    redis: RedisClient
    manager: ApiKeyManager
    apiKey: Awaited<ReturnType<ApiKeyManager['validateKey']>>
  }
}
