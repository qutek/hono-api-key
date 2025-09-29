import { createClient, type Client } from '@libsql/client';
import { ApiKeyRecord, RateLimitConfig, StorageAdapter } from '../../../../src';

/**
 * LibsqlAdapter implements the StorageAdapter interface for libSQL (sqlite-compatible, e.g. Turso).
 * Pass a libsql client or connection string to the constructor.
 */
export class LibsqlAdapter implements StorageAdapter {
  private client: Client;
  private table: string;

  /**
   * Accepts any valid libsql client, or any valid createClient options (sync/async, HTTP, file, Web, in-memory, etc).
   *
   * Example usage:
   *   new LibsqlAdapter({ url: 'file:mydb.sqlite' })
   *   new LibsqlAdapter({ url: 'https://user.turso.io', authToken: '...' })
   *   new LibsqlAdapter({ client: myClient })
   *   new LibsqlAdapter({ memory: true }) // in-memory
   */
  constructor(options: {
    client?: Client;
    url?: string;
    authToken?: string;
    syncUrl?: string;
    config?: any;
    table?: string;
    memory?: boolean;
  }) {
    if (options.client) {
      this.client = options.client;
    } else if (options.memory) {
      // Use a shared in-memory database
      this.client = createClient({ url: ":memory:" });
    } else if (options.config) {
      this.client = createClient(options.config);
    } else if (options.url) {
      // Accepts url, authToken, syncUrl for all libsql connection types
      const { url, authToken, syncUrl } = options;
      this.client = createClient({ url, authToken, syncUrl });
    } else {
      throw new Error('LibsqlAdapter requires a client, config, url, or memory: true');
    }
    this.table = options.table ?? 'api_keys';
  }

  async saveKey(apiKey: ApiKeyRecord): Promise<ApiKeyRecord> {
    const sql = `INSERT INTO ${this.table} (id, key, ownerId, name, permissions, rateLimit, isActive, createdAt, lastUsedAt, expiresAt, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    await this.client.execute({
      sql,
      args: [
        apiKey.id,
        apiKey.key,
        apiKey.ownerId,
        apiKey.name,
        JSON.stringify(apiKey.permissions ?? {}),
        apiKey.rateLimit ? JSON.stringify(apiKey.rateLimit) : null,
        apiKey.isActive ? 1 : 0,
        apiKey.createdAt,
        apiKey.lastUsedAt,
        apiKey.expiresAt,
        JSON.stringify(apiKey.metadata ?? {}),
      ],
    });
    return apiKey;
  }

  async getKeyById(keyId: string): Promise<ApiKeyRecord | null> {
    const sql = `SELECT * FROM ${this.table} WHERE id = ? LIMIT 1`;
    const res = await this.client.execute({ sql, args: [keyId] });
    return res.rows.length ? this.rowToRecord(res.rows[0]) : null;
  }

  async getKeyByValue(keyValue: string): Promise<ApiKeyRecord | null> {
    const sql = `SELECT * FROM ${this.table} WHERE key = ? LIMIT 1`;
    const res = await this.client.execute({ sql, args: [keyValue] });
    return res.rows.length ? this.rowToRecord(res.rows[0]) : null;
  }

  async getKeysByownerId(ownerId: string): Promise<ApiKeyRecord[]> {
    const sql = `SELECT * FROM ${this.table} WHERE ownerId = ?`;
    const res = await this.client.execute({ sql, args: [ownerId] });
    return res.rows.map(this.rowToRecord);
  }

  async updateKey(keyId: string, updatedKey: ApiKeyRecord): Promise<ApiKeyRecord | null> {
    const sql = `UPDATE ${this.table} SET key=?, ownerId=?, name=?, permissions=?, rateLimit=?, isActive=?, createdAt=?, lastUsedAt=?, expiresAt=?, metadata=? WHERE id=?`;
    await this.client.execute({
      sql,
      args: [
        updatedKey.key,
        updatedKey.ownerId,
        updatedKey.name,
        JSON.stringify(updatedKey.permissions ?? {}),
        updatedKey.rateLimit ? JSON.stringify(updatedKey.rateLimit) : null,
        updatedKey.isActive ? 1 : 0,
        updatedKey.createdAt,
        updatedKey.lastUsedAt,
        updatedKey.expiresAt,
        JSON.stringify(updatedKey.metadata ?? {}),
        keyId,
      ],
    });
    return this.getKeyById(keyId);
  }

  async deleteKey(keyId: string): Promise<boolean> {
    const sql = `DELETE FROM ${this.table} WHERE id = ?`;
    await this.client.execute({ sql, args: [keyId] });
    return true;
  }

  /**
   * Implements a sliding window rate limit using a separate table (api_key_rate_limits).
   * Returns true if allowed, false if rate limit exceeded.
   * Table schema (create if not exists):
   *   CREATE TABLE IF NOT EXISTS api_key_rate_limits (
   *     key_id TEXT PRIMARY KEY,
   *     window_start INTEGER NOT NULL,
   *     count INTEGER NOT NULL
   *   );
   */
  async checkRateLimit(keyId: string, rateLimit: RateLimitConfig): Promise<boolean> {
    const table = 'api_key_rate_limits';
    // Ensure table exists (idempotent)
    await this.client.execute(`CREATE TABLE IF NOT EXISTS ${table} (key_id TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL)`);
    const now = Date.now(); // ms
    const windowMs = rateLimit.windowMs;
    // Try to fetch current window
    const res = await this.client.execute({
      sql: `SELECT window_start, count FROM ${table} WHERE key_id = ?`,
      args: [keyId],
    });
    let windowStart = 0;
    let count = 0;
    if (res.rows.length) {
      windowStart = Number(res.rows[0].window_start);
      count = Number(res.rows[0].count);
    }
    // If window expired, reset
    if (now - windowStart >= windowMs) {
      windowStart = now;
      count = 0;
    }
    if (count + 1 > rateLimit.maxRequests) {
      // Exceeded
      return false;
    }
    // Upsert new count and window
    await this.client.execute({
      sql: `INSERT INTO ${table} (key_id, window_start, count) VALUES (?, ?, ?)
        ON CONFLICT(key_id) DO UPDATE SET window_start=excluded.window_start, count=excluded.count`,
      args: [keyId, windowStart, count + 1],
    });
    return true;
  }

  private rowToRecord = (row: any): ApiKeyRecord => ({
    id: row.id,
    key: row.key,
    ownerId: row.ownerId,
    name: row.name,
    permissions: row.permissions ? JSON.parse(row.permissions) : {},
    rateLimit: row.rateLimit ? JSON.parse(row.rateLimit) : undefined,
    isActive: !!row.isActive,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date(row.createdAt * 1000).toISOString(),
    lastUsedAt: row.lastUsedAt ? (typeof row.lastUsedAt === 'string' ? row.lastUsedAt : new Date(row.lastUsedAt * 1000).toISOString()) : null,
    expiresAt: row.expiresAt ? (typeof row.expiresAt === 'string' ? row.expiresAt : new Date(row.expiresAt * 1000).toISOString()) : null,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
  });
}

export default LibsqlAdapter;

