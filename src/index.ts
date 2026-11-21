import { Pool } from "pg";
import { buildApp } from "./app.js";
import { PORT } from "./config.js";
import { PgLeadStore } from "./pg-store.js";
import { MemoryLeadStore } from "./store.js";

// Production needs a database. Without DATABASE_URL the service refuses to start, so no lead is
// accepted and then lost.
const databaseUrl = process.env.DATABASE_URL;
if (process.env.NODE_ENV === "production" && !databaseUrl) {
  throw new Error("website-api: DATABASE_URL is required in production");
}

const store = databaseUrl ? new PgLeadStore(new Pool({ connectionString: databaseUrl, max: 5 })) : new MemoryLeadStore();
const corsOrigins = (process.env.CORS_ORIGINS ?? "https://qavrillabs.com,https://staging.qavrillabs.com")
  .split(",").map((s) => s.trim()).filter(Boolean);
const webhook = process.env.LEAD_WEBHOOK_URL;

const app = buildApp({
  store,
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
