import { readFile } from "node:fs/promises";
import { pool } from "../lib/db/src/index";
try {
  await pool.query(await readFile(new URL("./demo.sql",import.meta.url),"utf8"));
  console.log("Demo columns installed. Existing agency and Brain retained.");
} finally {await pool.end();}
