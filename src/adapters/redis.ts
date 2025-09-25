import type { ApiKeyRecord, RateLimitConfig, StorageAdapter } from '../types';

export type RedisClient = {
  get(key: string): Promise<string | object | null>;
  set(key: string, value: string): Promise<string | null>;
  del(key: string): Promise<number>;
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
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
  private rateKey = (id: string) => `${this.ns()}rate:${id}`;

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
    const records = await Promise.all(ids.map((id) => this.redis.get(this.idKey(id))));
    return records.filter(Boolean).map((data) => {
      if (typeof data === 'string') {
        return JSON.parse(data) as ApiKeyRecord;
      }
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
      this.redis.del(this.rateKey(keyId)),
    ]);
    return true;
  }

  async checkRateLimit(keyId: string, rateLimit: RateLimitConfig): Promise<boolean> {
    const now = Date.now();
    const key = this.rateKey(keyId);
    const data = await this.redis.get(key);

    let state: { requests: number[]; windowStart: number } | null = null;
    if (data) {
      if (typeof data === 'string') {
        state = JSON.parse(data) as { requests: number[]; windowStart: number };
      } else {
        state = data as { requests: number[]; windowStart: number };
      }
    }

    if (!state) {
      state = { requests: [], windowStart: now };
    }

    const { windowMs, maxRequests } = rateLimit;
    if (now - state.windowStart > windowMs) {
      state.requests = [];
      state.windowStart = now;
    }
    state.requests = state.requests.filter((t) => now - t < windowMs);
    if (state.requests.length >= maxRequests) {
      await this.redis.set(key, JSON.stringify(state));
      return false;
    }
    state.requests.push(now);
    await this.redis.set(key, JSON.stringify(state));
    return true;
  }
}

export default RedisAdapter;
