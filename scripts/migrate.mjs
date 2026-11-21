// Applies db/migrations/*.sql in order, once each, as the owner role.
// Usage: OWNER_URL=... node scripts/migrate.mjs
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const url = process.env.OWNER_URL;
if (!url) {
  console.error("set OWNER_URL to the owner connection string");
  process.exit(1);
}

const dir = join(import.meta.dirname, "..", "db", "migrations");
const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const applied = new Set(
    (await client.query("SELECT name FROM public.schema_migrations")).rows.map((r) => r.name),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(dir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO public.schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log("applied", file);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`${file} failed: ${error.message}`);
    }
  }
  console.log("migrations up to date");
} finally {
  await client.end();
}
