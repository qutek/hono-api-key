import type { ApiKeyRecord, RateLimitConfig, StorageAdapter } from '../types';

export type RedisClient = {
  get(key: string): Promise<string | object | null>;
  set(key: string, value: string): Promise<string | null>;
  del(key: string): Promise<number>;
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  // Optional but used when available for efficiency
  mget?: (...keys: string[]) => Promise<(string | null)[]>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number | 'OK' | null>;
};

export class RedisAdapter implements StorageAdapter {
  constructor(
    private readonly redis: RedisClient,
    private readonly namespacePrefix: string = 'apikey:',
  ) {}

  private ns(): string {
    return this.namespacePrefix.endsWith(':') ? this.namespacePrefix : `${this.namespacePrefix}:`;
  }

  private idKey = (id: string) => `${this.ns()}id:${id}`;
  private valueKey = (val: string) => `${this.ns()}value:${val}`;
  private ownerKey = (ownerId: string) => `${this.ns()}owner:${ownerId}`;
  // Keep hash tag to co-locate keys in the same cluster slot
  private rateKeyBucket = (id: string, bucket: number) => `${this.ns()}rate:{${id}}:${bucket}`;

  async saveKey(apiKey: ApiKeyRecord): Promise<ApiKeyRecord> {
    await Promise.all([
      this.redis.set(this.idKey(apiKey.id), JSON.stringify(apiKey)),
      this.redis.set(this.valueKey(apiKey.key), apiKey.id),
      this.redis.sadd(this.ownerKey(apiKey.ownerId), apiKey.id),
    ]);
    return apiKey;
  }

  async getKeyById(keyId: string): Promise<ApiKeyRecord | null> {
    const data = await this.redis.get(this.idKey(keyId));
    if (!data) return null;

    // Handle both string and object responses from Upstash Redis
    if (typeof data === 'string') {
      return JSON.parse(data) as ApiKeyRecord;
    }
    return data as ApiKeyRecord;
  }

  async getKeyByValue(keyValue: string): Promise<ApiKeyRecord | null> {
    const id = await this.redis.get(this.valueKey(keyValue));
    if (!id) return null;

    // Convert to string if it's an object
    const idString = typeof id === 'string' ? id : String(id);
    return this.getKeyById(idString);
  }

  async getKeysByownerId(ownerId: string): Promise<ApiKeyRecord[]> {
    const ids = (await this.redis.smembers(this.ownerKey(ownerId))) || [];
    if (!ids.length) return [];
    const idKeys = ids.map((id) => this.idKey(id));
    let raw: (string | object | null)[];
    if (this.redis.mget) {
      const m = await this.redis.mget(...idKeys);
      raw = m as (string | null)[];
    } else {
      raw = await Promise.all(idKeys.map((k) => this.redis.get(k)));
    }
    return raw.filter(Boolean).map((data) => {
      if (typeof data === 'string') return JSON.parse(data) as ApiKeyRecord;
      return data as ApiKeyRecord;
    });
  }

  async updateKey(keyId: string, updatedKey: ApiKeyRecord): Promise<ApiKeyRecord | null> {
    const existing = await this.getKeyById(keyId);
    if (!existing) return null;

    if (existing.key !== updatedKey.key) {
      await this.redis.del(this.valueKey(existing.key));
      await this.redis.set(this.valueKey(updatedKey.key), keyId);
    }
    if (existing.ownerId !== updatedKey.ownerId) {
      await this.redis.srem(this.ownerKey(existing.ownerId), keyId);
      await this.redis.sadd(this.ownerKey(updatedKey.ownerId), keyId);
    }
    await this.redis.set(this.idKey(keyId), JSON.stringify(updatedKey));
    return updatedKey;
  }

  async deleteKey(keyId: string): Promise<boolean> {
    const existing = await this.getKeyById(keyId);
    if (!existing) return false;
    await Promise.all([
      this.redis.del(this.idKey(keyId)),
      this.redis.del(this.valueKey(existing.key)),
      this.redis.srem(this.ownerKey(existing.ownerId), keyId),
    ]);
    return true;
  }

  async checkRateLimit(keyId: string, rateLimit: RateLimitConfig): Promise<boolean> {
    const { windowMs, maxRequests } = rateLimit;
    const bucket = Math.floor(Date.now() / windowMs);
    const key = this.rateKeyBucket(keyId, bucket);
    const count = await this.redis.incr(key);
    if (count === 1) {
      // first hit in window, set TTL
      await this.redis.expire(key, Math.ceil(windowMs / 1000));
    }
    return count <= maxRequests;
  }
}

export default RedisAdapter;
