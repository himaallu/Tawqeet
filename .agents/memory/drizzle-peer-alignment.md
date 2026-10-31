---
name: Drizzle peer alignment
description: Why adding a pg-boss telemetry dependency can cause cross-package Drizzle type incompatibilities.
---

Keep Drizzle's optional peer dependencies aligned between packages that exchange its tables, database client and SQL expressions.

**Why:** Adding the telemetry API required by pg-boss to only the API package caused pnpm to create separate Drizzle peer-resolution instances. Identical Drizzle versions then had incompatible private SQL/column types across the API/database boundary. Rebuilding generated declarations alone does not fix divergent peer identities.

**How to apply:** When adding or changing Drizzle-related peers, compare resolved dependency identities in both API and database packages. Align peer availability instead of casting away SQL/column type errors.
