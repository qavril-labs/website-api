import type { Pool } from "pg";
import type { LeadStore, StoredLead } from "./store.js";

/** Inserts a lead unless the same email and interest was stored in the last day (same rule as the ERP monolith). */
export class PgLeadStore implements LeadStore {
  constructor(private readonly pool: Pool) {}

  async insertOnce(lead: StoredLead): Promise<boolean> {
    const res = await this.pool.query(
      `INSERT INTO leads (id, name, email, company, country, interest, industry, message, source, slot, timezone,
                          consent_given, consent_at, created_at)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12::timestamptz, $12::timestamptz
        WHERE NOT EXISTS (
          SELECT 1 FROM leads
           WHERE lower(email) = lower($3) AND interest = $6 AND created_at > $12::timestamptz - interval '1 day'
        )`,
      [lead.id, lead.name, lead.email, lead.company, lead.country, lead.interest, lead.industry, lead.message,
        lead.source, lead.slot, lead.timezone, lead.createdAt],
    );
    return res.rowCount === 1;
  }

  async recent(limit: number): Promise<Record<string, unknown>[]> {
    const res = await this.pool.query("SELECT * FROM leads ORDER BY created_at DESC LIMIT $1", [limit]);
    return res.rows;
  }

  async total(): Promise<number> {
    const res = await this.pool.query("SELECT COUNT(*)::int AS n FROM leads");
    return Number(res.rows[0].n);
  }
}
