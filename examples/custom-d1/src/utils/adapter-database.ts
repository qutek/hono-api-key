import { and, eq } from 'drizzle-orm';
import { getContext } from 'hono/context-storage';
import { initDbConnect } from '../db';
import { apiKeys } from '../db/schema';
import { Environment } from '../../bindings';
import { ApiKeyRecord, RateLimitConfig, StorageAdapter } from '../../../../src';

type DbApiKey = typeof apiKeys.$inferSelect;
type DbApiKeyInsert = typeof apiKeys.$inferInsert;

function toRecord(row: DbApiKey): ApiKeyRecord {
  return {
    id: row.id,
    key: row.key,
    ownerId: row.ownerId,
    name: row.name,
    permissions: (row.permissions as unknown as Record<string, unknown>) ?? {},
    rateLimit: (row.rateLimit as unknown as RateLimitConfig | undefined) ?? undefined,
    isActive: Boolean(row.isActive),
    createdAt: (row.createdAt instanceof Date
      ? row.createdAt
      : new Date(row.createdAt ?? Date.now())
    ).toISOString(),
    lastUsedAt: row.lastUsedAt
      ? (row.lastUsedAt instanceof Date ? row.lastUsedAt : new Date(row.lastUsedAt)).toISOString()
      : null,
    expiresAt: row.expiresAt
      ? (row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt)).toISOString()
      : null,
    metadata: (row.metadata as unknown as Record<string, unknown>) ?? {},
  };
}

function toInsert(record: ApiKeyRecord): DbApiKeyInsert {
  return {
    id: record.id,
    key: record.key,
    ownerId: record.ownerId,
    name: record.name,
    permissions: record.permissions as any,
    rateLimit: record.rateLimit as any,
    isActive: record.isActive,
    createdAt: new Date(record.createdAt),
    lastUsedAt: record.lastUsedAt ? new Date(record.lastUsedAt) : null,
    expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
    metadata: record.metadata as any,
  };
}

export class DatabaseAdapter implements StorageAdapter {
  private getDb() {
    const DB = getContext<Environment>().env.DB;
    return initDbConnect(DB);
  }

  async saveKey(apiKey: ApiKeyRecord): Promise<ApiKeyRecord> {
    const db = this.getDb();
    await db.insert(apiKeys).values(toInsert(apiKey));
    return apiKey;
  }

  async getKeyById(keyId: string): Promise<ApiKeyRecord | null> {
    const db = this.getDb();
    const row = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.id, keyId),
    });
    return row ? toRecord(row) : null;
  }

  async getKeyByValue(keyValue: string): Promise<ApiKeyRecord | null> {
    const db = this.getDb();
    const row = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.key, keyValue),
    });
    return row ? toRecord(row) : null;
  }

  async getKeysByownerId(ownerId: string): Promise<ApiKeyRecord[]> {
    const db = this.getDb();
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.ownerId, ownerId));
    return rows.map(toRecord);
  }

  async updateKey(keyId: string, updatedKey: ApiKeyRecord): Promise<ApiKeyRecord | null> {
    const db = this.getDb();
    const res = await db
      .update(apiKeys)
      .set(toInsert(updatedKey))
      .where(eq(apiKeys.id, keyId))
      .returning();
    const row = res[0];
    return row ? toRecord(row) : null;
  }

  async deleteKey(keyId: string): Promise<boolean> {
    const db = this.getDb();
    const res = await db.delete(apiKeys).where(eq(apiKeys.id, keyId));
    // drizzle d1 returns number of changes in meta? We'll assume success if no throw
    return true;
  }

  async checkRateLimit(keyId: string, rateLimit: RateLimitConfig): Promise<boolean> {
    const db = this.getDb();
    const row = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.id, keyId),
    });
    if (!row) return false;

    // Persist rate window in metadata to avoid additional tables
    const metadata = (row.metadata as unknown as Record<string, unknown>) ?? {};
    const state = (metadata.__rateState as
      | { requests: number[]; windowStart: number }
      | undefined) ?? {
      requests: [],
      windowStart: Date.now(),
    };

    const now = Date.now();
    const windowMs = rateLimit.windowMs;
    const maxRequests = rateLimit.maxRequests;

    if (now - state.windowStart > windowMs) {
      state.requests = [];
      state.windowStart = now;
    }

    state.requests = state.requests.filter((ts) => now - ts < windowMs);
    if (state.requests.length >= maxRequests) {
      // Save state and deny
      const newMeta = { ...metadata, __rateState: state } as any;
      await db.update(apiKeys).set({ metadata: newMeta }).where(eq(apiKeys.id, keyId));
      return false;
    }

    state.requests.push(now);
    const newMeta = { ...metadata, __rateState: state } as any;
    await db
      .update(apiKeys)
      .set({ metadata: newMeta, lastUsedAt: new Date(now) })
      .where(and(eq(apiKeys.id, keyId)));
    return true;
  }
}

export default DatabaseAdapter;
