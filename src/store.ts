// Lead storage. One row per lead. A repeat of the same email and interest within a day is not
// stored twice (a retry after a timeout, for example). Returns true when a row was written.

import type { LeadInput } from "./schema.js";

export interface StoredLead extends LeadInput {
  id: string;
  createdAt: string;
}

export interface LeadStore {
  insertOnce(lead: StoredLead): Promise<boolean>;
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
}
