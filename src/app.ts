import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { RateLimiter } from "./rate-limit.js";
import { parseLead, ValidationError } from "./schema.js";
import type { LeadStore } from "./store.js";

export interface AppOptions {
  store: LeadStore;
  /** Browser origins allowed to call the endpoint (the marketing site). */
  corsOrigins: string[];
  /** Called once per stored lead. Failures are logged and never returned to the visitor. */
  notify?: (lead: Record<string, unknown>) => Promise<void>;
  rateLimit?: { max: number; windowMs: number };
  trustProxy?: boolean;
  now?: () => Date;
}

export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ logger: false, trustProxy: options.trustProxy ?? false });
  const now = options.now ?? (() => new Date());
  const origins = new Set(options.corsOrigins);
  const limiter = new RateLimiter(options.rateLimit ?? { max: 5, windowMs: 10 * 60 * 1000 });

  function cors(origin: unknown, reply: { header(name: string, value: string): unknown }): void {
    reply.header("vary", "Origin");
    if (typeof origin === "string" && origins.has(origin)) {
      reply.header("access-control-allow-origin", origin);
      reply.header("access-control-allow-methods", "POST, OPTIONS");
      reply.header("access-control-allow-headers", "content-type");
      reply.header("access-control-max-age", "600");
    }
  }

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ValidationError) {
      return reply.code(400).send({ error: { code: "VALIDATION", message: "Invalid request", details: error.details } });
    }
    const fastifyError = error as { statusCode?: number };
    if (fastifyError.statusCode === 400) {
      return reply.code(400).send({ error: { code: "VALIDATION", message: "request body is not valid JSON" } });
    }
    app.log.error(error);
    return reply.code(500).send({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } });
  });

  app.get("/health", async () => ({ status: "ok", service: "website-api" }));

  app.options("/v1/public/leads", async (req, reply) => {
    cors(req.headers.origin, reply);
    return reply.code(204).send();
  });

  app.post("/v1/public/leads", async (req, reply) => {
    cors(req.headers.origin, reply);
    const nowMs = now().getTime();
    if (limiter.blocked(req.ip, nowMs)) {
      return reply.code(429).send({ error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." } });
    }
    const lead = parseLead(req.body);
    // A filled honeypot gets the same answer as a real submission, and is not stored.
    if (lead.honeypot) return reply.code(201).send({ status: "received" });

    // Only accepted requests use up the allowance. A mistyped form does not.
    limiter.hit(req.ip, nowMs);
    const createdAt = now().toISOString();
    const stored = { ...lead, id: randomUUID(), createdAt };
    const written = await options.store.insertOnce(stored);
    if (written && options.notify) {
      options.notify({
        id: stored.id, createdAt, name: lead.name, email: lead.email, company: lead.company, country: lead.country,
        interest: lead.interest, industry: lead.industry, message: lead.message, source: lead.source, slot: lead.slot, timezone: lead.timezone,
      }).catch((error: unknown) => app.log.error(error));
    }
    return reply.code(201).send({ status: "received" });
  });

  return app;
}
