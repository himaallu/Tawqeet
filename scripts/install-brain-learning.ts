import { readFile } from "node:fs/promises";
import { pool } from "../lib/db/src/index";

// This is an explicit operator migration command, not an app/worker startup side effect.
try {
  const sql = await readFile(new URL("./brain-learning.sql", import.meta.url), "utf8");
  await pool.query(sql);
  console.log("Brain reply-learning trigger installed.");
} finally { await pool.end(); }
