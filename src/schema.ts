// Validation for POST /v1/public/leads. Must match contract/lead-form.contract.json (the test checks it).

export const INTERESTS = ["early_access", "demo", "partner", "trial"] as const;
export type Interest = (typeof INTERESTS)[number];

export const DEMO_SLOTS = [
  "Monday morning", "Monday afternoon", "Tuesday morning", "Tuesday afternoon", "Wednesday morning",
  "Wednesday afternoon", "Thursday morning", "Thursday afternoon", "Friday morning", "Friday afternoon",
] as const;

export interface LeadInput {
  name: string;
  email: string;
  company: string | null;
  country: string | null;
  interest: Interest;
  industry: string | null;
  message: string | null;
  source: string;
  slot: string | null;
  timezone: string | null;
  /** True when the honeypot field was filled in. Such submissions are answered but not stored. */
  honeypot: boolean;
}

export class ValidationError extends Error {
  constructor(readonly details: Array<{ path: string; message: string }>) {
    super("Invalid request");
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(body: Record<string, unknown>, key: string, max: number, required: boolean, errors: ValidationError["details"]): string | null {
  const raw = body[key];
  if (raw === undefined || raw === null) {
    if (required) errors.push({ path: key, message: "required" });
    return null;
  }
  if (typeof raw !== "string") {
    errors.push({ path: key, message: "must be text" });
    return null;
  }
  const value = raw.trim();
  if (value.length > max) errors.push({ path: key, message: `must be at most ${max} characters` });
  if (required && value.length === 0) errors.push({ path: key, message: "required" });
  return value.length === 0 ? null : value;
}

/** Parses the form body. Throws ValidationError with one entry per problem. */
export function parseLead(input: unknown): LeadInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ValidationError([{ path: "", message: "body must be an object" }]);
  }
  const body = input as Record<string, unknown>;
  const errors: ValidationError["details"] = [];

  const name = text(body, "name", 120, true, errors);
  const emailRaw = text(body, "email", 254, true, errors);
  const email = emailRaw?.toLowerCase() ?? null;
  if (email !== null && !EMAIL.test(email)) errors.push({ path: "email", message: "must be a valid email" });

  const interest = body.interest;
  if (!INTERESTS.includes(interest as Interest)) errors.push({ path: "interest", message: "must be one of " + INTERESTS.join(", ") });

  if (body.consent !== true) errors.push({ path: "consent", message: "must be true" });

  const slotRaw = body.slot;
  let slot: string | null = null;
  if (slotRaw !== undefined && slotRaw !== null && slotRaw !== "") {
    if (!DEMO_SLOTS.includes(slotRaw as (typeof DEMO_SLOTS)[number])) errors.push({ path: "slot", message: "is not an offered slot" });
    else slot = slotRaw as string;
  }

  const company = text(body, "company", 160, false, errors);
  const country = text(body, "country", 80, false, errors);
  const industry = text(body, "industry", 80, false, errors);
  const message = text(body, "message", 1000, false, errors);
  const source = text(body, "source", 100, false, errors) ?? "direct";
  const timezone = text(body, "timezone", 64, false, errors);
  const honeypot = text(body, "website", 200, false, errors) !== null;

  if (errors.length > 0 || name === null || email === null) throw new ValidationError(errors);
  return {
    name, email, company, country, interest: interest as Interest, industry, message, source, slot, timezone, honeypot,
  };
}
