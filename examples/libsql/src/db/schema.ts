import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text('key').notNull(),
    ownerId: text('ownerId').notNull(),
    name: text('name').notNull(),
    permissions: text('permissions', { mode: 'json' }).notNull().default('{}'),
    rateLimit: text('rateLimit', { mode: 'json' }),
    isActive: integer('isActive', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    lastUsedAt: integer('lastUsedAt', { mode: 'timestamp' }),
    expiresAt: integer('expiresAt', { mode: 'timestamp' }),
    metadata: text('metadata', { mode: 'json' }).notNull().default('{}'),
  },
  (t) => [index('owner_index').on(t.ownerId), index('key_index').on(t.key)],
);

export type InsertApiKey = typeof apiKeys.$inferInsert;
export type SelectApiKey = typeof apiKeys.$inferSelect;
