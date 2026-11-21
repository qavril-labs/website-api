import { Pool } from "pg";
import { buildApp } from "./app.js";
import { PORT } from "./config.js";
import { MemoryCmsStore } from "./cms/store.js";
import { PgCmsStore } from "./cms/pg-store.js";
import { PgLeadStore } from "./pg-store.js";
import { MemoryLeadStore } from "./store.js";

// Production needs a database and an admin key. Without them the service refuses to start, so no
// lead is accepted and then lost, and no content can be edited by an unknown caller.
const databaseUrl = process.env.DATABASE_URL;
const adminKey = process.env.ADMIN_KEY;
const production = process.env.NODE_ENV === "production";
if (production && !databaseUrl) throw new Error("website-api: DATABASE_URL is required in production");
if (production && (!adminKey || adminKey.length < 32)) throw new Error("website-api: ADMIN_KEY (32+ characters) is required in production");

const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 5 }) : undefined;
const corsOrigins = (process.env.CORS_ORIGINS ?? "https://qavrillabs.com,https://staging.qavrillabs.com")
  .split(",").map((s) => s.trim()).filter(Boolean);
const webhook = process.env.LEAD_WEBHOOK_URL;

const app = buildApp({
  store: pool ? new PgLeadStore(pool) : new MemoryLeadStore(),
  cms: pool ? new PgCmsStore(pool) : new MemoryCmsStore(),
  adminKey,
  corsOrigins,
  trustProxy: process.env.TRUST_PROXY === "true",
  notify: webhook
    ? async (lead) => {
        const res = await fetch(webhook, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(lead), signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) throw new Error(`lead webhook returned ${res.status}`);
      }
    : undefined,
});
await app.listen({ port: PORT, host: "0.0.0.0" });
