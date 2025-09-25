import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RedisAdapter, type RedisClient } from './redis';
import type { ApiKeyRecord, RateLimitConfig } from '../types';

// Mock Redis client
class MockRedis implements RedisClient {
  private data = new Map<string, string>();
  private sets = new Map<string, Set<string>>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.data.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const existed = this.data.has(key);
    this.data.delete(key);
    return existed ? 1 : 0;
  }

  async sadd(key: string, member: string): Promise<number> {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    const set = this.sets.get(key)!;
    const existed = set.has(member);
    set.add(member);
    return existed ? 0 : 1;
  }

  async srem(key: string, member: string): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return 0;
    const existed = set.has(member);
    set.delete(member);
    return existed ? 1 : 0;
  }

  async smembers(key: string): Promise<string[]> {
    const set = this.sets.get(key);
    return set ? Array.from(set) : [];
  }

  // Optional/extra commands used by adapter
  async mget(...keys: string[]): Promise<(string | null)[]> {
    return keys.map((k) => this.data.get(k) ?? null);
  }

  async incr(key: string): Promise<number> {
    const curr = this.data.get(key);
    const n = curr ? parseInt(curr, 10) : 0;
    const next = n + 1;
    this.data.set(key, String(next));
    return next;
  }

  async expire(_key: string, _seconds: number): Promise<number> {
    // no-op in mock
    return 1;
  }

  clear() {
    this.data.clear();
    this.sets.clear();
  }
}

describe('RedisAdapter', () => {
  let mockRedis: MockRedis;
  let adapter: RedisAdapter;

  beforeEach(() => {
    mockRedis = new MockRedis();
    adapter = new RedisAdapter(mockRedis, 'test:');
  });

  const createApiKey = (overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord => ({
    id: 'test-id',
    key: 'test-key',
    ownerId: 'test-owner',
    name: 'Test Key',
    permissions: {},
    isActive: true,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    expiresAt: null,
    metadata: {},
    ...overrides,
  });

  describe('saveKey', () => {
    it('should save key with all mappings', async () => {
      const apiKey = createApiKey();
      const result = await adapter.saveKey(apiKey);

      expect(result).toEqual(apiKey);
      expect(await mockRedis.get('test:id:test-id')).toBe(JSON.stringify(apiKey));
      expect(await mockRedis.get('test:value:test-key')).toBe('test-id');
      expect(await mockRedis.smembers('test:owner:test-owner')).toEqual(['test-id']);
    });
  });

  describe('getKeyById', () => {
    it('should return key by id', async () => {
      const apiKey = createApiKey();
      await adapter.saveKey(apiKey);

      const result = await adapter.getKeyById('test-id');
      expect(result).toEqual(apiKey);
    });

    it('should return null for non-existent key', async () => {
      const result = await adapter.getKeyById('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getKeyByValue', () => {
    it('should return key by value', async () => {
      const apiKey = createApiKey();
      await adapter.saveKey(apiKey);

      const result = await adapter.getKeyByValue('test-key');
      expect(result).toEqual(apiKey);
    });

    it('should return null for non-existent value', async () => {
      const result = await adapter.getKeyByValue('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getKeysByownerId', () => {
    it('should return keys for owner', async () => {
      const apiKey1 = createApiKey({ id: 'key1', key: 'key1-value' });
      const apiKey2 = createApiKey({ id: 'key2', key: 'key2-value' });
      await adapter.saveKey(apiKey1);
      await adapter.saveKey(apiKey2);

      const result = await adapter.getKeysByownerId('test-owner');
      expect(result).toHaveLength(2);
      expect(result).toContainEqual(apiKey1);
      expect(result).toContainEqual(apiKey2);
    });

    it('should return empty array for non-existent owner', async () => {
      const result = await adapter.getKeysByownerId('non-existent');
      expect(result).toEqual([]);
    });
  });

  describe('updateKey', () => {
    it('should update key and mappings', async () => {
      const original = createApiKey();
      await adapter.saveKey(original);

      const updated = { ...original, name: 'Updated Key', key: 'new-key' };
      const result = await adapter.updateKey('test-id', updated);

      expect(result).toEqual(updated);
      expect(await mockRedis.get('test:id:test-id')).toBe(JSON.stringify(updated));
      expect(await mockRedis.get('test:value:new-key')).toBe('test-id');
      expect(await mockRedis.get('test:value:test-key')).toBeNull();
    });

    it('should update owner mapping when owner changes', async () => {
      const original = createApiKey();
      await adapter.saveKey(original);

      const updated = { ...original, ownerId: 'new-owner' };
      await adapter.updateKey('test-id', updated);

      expect(await mockRedis.smembers('test:owner:test-owner')).toEqual([]);
      expect(await mockRedis.smembers('test:owner:new-owner')).toEqual(['test-id']);
    });

    it('should return null for non-existent key', async () => {
      const result = await adapter.updateKey('non-existent', createApiKey());
      expect(result).toBeNull();
    });
  });

  describe('deleteKey', () => {
    it('should delete key and all mappings', async () => {
      const apiKey = createApiKey();
      await adapter.saveKey(apiKey);

      const result = await adapter.deleteKey('test-id');
      expect(result).toBe(true);

      expect(await mockRedis.get('test:id:test-id')).toBeNull();
      expect(await mockRedis.get('test:value:test-key')).toBeNull();
      expect(await mockRedis.smembers('test:owner:test-owner')).toEqual([]);
    });

    it('should return false for non-existent key', async () => {
      const result = await adapter.deleteKey('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('checkRateLimit', () => {
    const rateLimit: RateLimitConfig = { windowMs: 1000, maxRequests: 2 };

    it('should allow requests within limit', async () => {
      const result1 = await adapter.checkRateLimit('test-id', rateLimit);
      const result2 = await adapter.checkRateLimit('test-id', rateLimit);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    it('should block requests exceeding limit', async () => {
      await adapter.checkRateLimit('test-id', rateLimit);
      await adapter.checkRateLimit('test-id', rateLimit);
      const result3 = await adapter.checkRateLimit('test-id', rateLimit);

      expect(result3).toBe(false);
    });

    it('should reset window after time expires', async () => {
      // Fill up the limit
      await adapter.checkRateLimit('test-id', rateLimit);
      await adapter.checkRateLimit('test-id', rateLimit);
      expect(await adapter.checkRateLimit('test-id', rateLimit)).toBe(false);

      // Mock time passing
      vi.useFakeTimers();
      vi.advanceTimersByTime(1001);

      const result = await adapter.checkRateLimit('test-id', rateLimit);
      expect(result).toBe(true);

      vi.useRealTimers();
    });

    it('should handle different keys independently', async () => {
      await adapter.checkRateLimit('key1', rateLimit);
      await adapter.checkRateLimit('key1', rateLimit);
      expect(await adapter.checkRateLimit('key1', rateLimit)).toBe(false);

      // Different key should still work
      expect(await adapter.checkRateLimit('key2', rateLimit)).toBe(true);
    });
  });

  describe('namespace handling', () => {
    it('should use custom namespace', async () => {
      const customAdapter = new RedisAdapter(mockRedis, 'custom:');
      const apiKey = createApiKey();
      await customAdapter.saveKey(apiKey);

      expect(await mockRedis.get('custom:id:test-id')).toBe(JSON.stringify(apiKey));
      expect(await mockRedis.get('custom:value:test-key')).toBe('test-id');
    });

    it('should add colon to namespace if missing', async () => {
      const customAdapter = new RedisAdapter(mockRedis, 'custom');
      const apiKey = createApiKey();
      await customAdapter.saveKey(apiKey);

      expect(await mockRedis.get('custom:id:test-id')).toBe(JSON.stringify(apiKey));
    });
  });
});
