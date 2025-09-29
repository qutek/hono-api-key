# GitHub Copilot Instructions for hono-api-key

## Project Overview
This project provides a secure, flexible API key manager and middleware for the [Hono](https://hono.dev/) web framework. It supports Node.js, Cloudflare Workers, and edge runtimes, with built-in adapters for Memory, KV, and Redis, and a clean `StorageAdapter` interface for custom backends. TypeScript is used throughout, and the codebase is ESM/CJS compatible.

## Key Guidelines for Copilot

### General
- **Follow TypeScript best practices**: Use type annotations, interfaces, and generics where appropriate.
- **Prefer composition over inheritance** for adapters and middleware.
- **Keep code modular**: Place new adapters in `src/adapters/`, utilities in `src/utils/`, and types in `src/types.ts`.
- **Document public APIs** with JSDoc comments.

### Middleware & API
- Middleware should be implemented as `apiKeyMiddleware(manager, options?)` and follow the signature in `src/index.ts`.
- API key management logic should be encapsulated in `ApiKeyManager` (`src/manager.ts`).
- Adapters must implement the `StorageAdapter` interface (`src/types.ts`).
- All API key records must conform to the `ApiKeyRecord` type.

### Code Style
- Use [ESLint](eslint.config.mjs) and [Prettier](https://prettier.io/) for formatting and linting.
- No `console.log` in production code (allowed in examples/tests).
- Use consistent type imports (`import type ...`).
- Ignore files/folders as configured in ESLint (e.g., `dist/`, `coverage/`, `node_modules/`, `examples/**/node_modules/`).

### Testing
- Use [Vitest](https://vitest.dev/) for all tests. Place tests alongside source files with `.test.ts` suffix.
- Write tests for all new features and adapters.
- Run tests with `pnpm test`.

### Examples
- Add new usage examples in the `examples/` directory. Follow the structure of `examples/basic.ts` or `examples/custom-d1/`.
- Example adapters should demonstrate custom storage backends and be well-commented.

### Contributions
- Use `pnpm` for dependency management.
- Run `pnpm format` before submitting PRs.
- Use [Changesets](https://github.com/changesets/changesets) for versioning (`pnpm changeset`).
- All code must be MIT licensed.

### Documentation
- Update `README.md` for any new features, adapters, or breaking changes.
- Document all public APIs and configuration options.

## Useful References
- Main API: `src/index.ts`, `src/manager.ts`, `src/types.ts`
- Example adapters: `src/adapters/`, `examples/custom-d1/src/utils/adapter-database.ts`
- Tests: `src/*.test.ts`, `src/adapters/*.test.ts`

## Useful Links
- @libsql/client SDK: https://github.com/tursodatabase/libsql-client-ts
- libSQL Client Docs: https://docs.turso.tech/sdk/ts/quickstart
- libSQL Drizzle: https://docs.turso.tech/sdk/ts/orm/drizzle
- libSQL Hono: https://docs.turso.tech/sdk/ts/guides/hono

---

For more details, see the main [README.md](../README.md) and example READMEs in `examples/`.
