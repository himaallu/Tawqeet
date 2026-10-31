import { readFile } from "node:fs/promises";
import { pool } from "../lib/db/src/index";
import { installCatalogue } from "../artifacts/api-server/src/lib/signals/catalog";

async function main() {
  const migration = await readFile(new URL("./signal-definitions.sql", import.meta.url), "utf8");
  await pool.query(migration);
  await installCatalogue();
  console.log("Installed 20 signal definitions; hiring_sales_role=35/30 days, hiring_surge=30/21 days. Existing lead scores recalculated. No external requests or emails.");
}
main().then(() => pool.end()).catch(e => {
  console.error("Signal catalogue installation failed:", e instanceof Error ? e.message : "Unknown error");
  void pool.end().then(() => process.exit(1));
});
