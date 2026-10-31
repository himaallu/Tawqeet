import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/** Recreates the tawqeet_test database and applies the committed migrations once per run. */
export default async function setup() {
  const admin = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
  await admin.connect();
  await admin.query("drop database if exists tawqeet_test with (force)");
  await admin.query("create database tawqeet_test");
  await admin.end();
  const pool = new pg.Pool({ connectionString: process.env.TEST_DB_URL });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
}
