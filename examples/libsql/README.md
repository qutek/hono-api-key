# libSQL Adapter Example for hono-api-key

This example demonstrates how to use `hono-api-key` with a custom libSQL adapter using [Turso](https://turso.tech) and [Drizzle ORM](https://orm.drizzle.team).

## Features

- Custom `StorageAdapter` implementation for libSQL/Turso
- Schema and migrations using Drizzle ORM
- Full example Hono application with API key authentication
- TypeScript throughout

## Setup

1. Create a Turso database and get credentials:
   ```bash
   turso db create my-api-keys-db
   turso db tokens create my-api-keys-db
   ```

2. Create `.env` file with your Turso credentials:
   ```bash
   TURSO_DATABASE_URL=libsql://your-database-name.turso.io
   TURSO_AUTH_TOKEN=your-auth-token
   ```

3. Install dependencies:
   ```bash
   pnpm install
   ```

4. Generate and apply migrations:
   ```bash
   pnpm run db:generate
   pnpm run db:migrate
   ```

## Usage

Run the development server:
```bash
pnpm dev
```

### Example Routes

1. Create an API key:
   ```bash
   curl -X POST http://localhost:8787/keys \
     -H "Content-Type: application/json" \
     -d '{"ownerId": "owner-1", "name": "test-key"}'
   ```

2. Use the API key:
   ```bash
   curl http://localhost:8787/secure \
     -H "x-api-key: your-api-key"
   ```

3. List keys for an owner:
   ```bash
   curl http://localhost:8787/keys/owner-1
   ```

## Database Schema

The schema in `src/db/schema.ts` defines the `api_keys` table with all necessary fields for the API key manager:

- `id` - Primary key (UUID)
- `key` - The API key value
- `ownerId` - Owner identifier
- `name` - Key name/description
- `permissions` - JSON field for permissions
- `rateLimit` - Optional rate limiting config
- `isActive` - Boolean flag
- `createdAt` - Creation timestamp
- `lastUsedAt` - Last usage timestamp
- `expiresAt` - Expiration timestamp
- `metadata` - JSON field for custom metadata

## Custom Adapter

The `DatabaseAdapter` in `src/utils/adapter-database.ts` implements the `StorageAdapter` interface from `hono-api-key`, using Drizzle ORM to interact with the libSQL database.

## License

MIT
