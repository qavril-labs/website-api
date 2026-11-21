// Lead storage. One row per lead. A repeat of the same email and interest within a day is not
// stored twice (a retry after a timeout, for example). Returns true when a row was written.

import type { LeadInput } from "./schema.js";

export interface StoredLead extends LeadInput {
  id: string;
  createdAt: string;
}

export interface LeadStore {
  insertOnce(lead: StoredLead): Promise<boolean>;
  /** Newest first, as rows in the admin's snake_case shape. */
  recent(limit: number): Promise<Record<string, unknown>[]>;
  total(): Promise<number>;
}

export class MemoryLeadStore implements LeadStore {
  readonly leads: StoredLead[] = [];

  async insertOnce(lead: StoredLead): Promise<boolean> {
    const at = Date.parse(lead.createdAt);
    const duplicate = this.leads.some(
      (l) => l.email === lead.email && l.interest === lead.interest && at - Date.parse(l.createdAt) < 24 * 60 * 60 * 1000,
    );
    if (duplicate) return false;
    this.leads.push(lead);
    return true;
  }

  async recent(limit: number) {
    return [...this.leads]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((l) => ({
        id: l.id, name: l.name, email: l.email, company: l.company, country: l.country, interest: l.interest,
        industry: l.industry, message: l.message, source: l.source, slot: l.slot, timezone: l.timezone,
        consent_given: true, consent_at: l.createdAt, created_at: l.createdAt,
      }));
  }

  async total() {
    return this.leads.length;
  }
}
