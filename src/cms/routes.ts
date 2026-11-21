// CMS routes. Public reads return only published content. Admin routes need the admin key.
// Response shapes match what the site and its admin page already read, so nothing changes for them.

import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { LeadStore } from "../store.js";
import { type CmsStore, type Row } from "./store.js";
import { parseArticle, parseFaq, parsePage } from "./validate.js";

export interface CmsDeps {
  cms: CmsStore;
  leads: LeadStore;
  /** The admin key. Unset means every admin route refuses. */
  adminKey?: string;
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function providedKey(req: FastifyRequest): string | null {
  const header = req.headers["x-admin-key"];
  if (typeof header === "string") return header;
  const auth = req.headers.authorization;
  return typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
}

export function registerCms(app: FastifyInstance, deps: CmsDeps): void {
  const { cms, leads, adminKey } = deps;

  const adminOnly = async (req: FastifyRequest, reply: FastifyReply) => {
    const key = providedKey(req);
    if (!adminKey || !key || !sameSecret(key, adminKey)) {
      return reply.code(401).send({ error: "Unauthorized: Invalid or missing admin authorization key" });
    }
  };

  /** Runs a handler and turns an unexpected failure into the 500 shape the admin page reads. */
  async function guard(reply: FastifyReply, fn: () => Promise<FastifyReply>): Promise<FastifyReply> {
    try {
      return await fn();
    } catch (error) {
      return reply.code(500).send({ error: error instanceof Error ? error.message : "unexpected error" });
    }
  }

  // Public reads
  app.get("/v1/public/cms/settings", async (_req, reply) => guard(reply, async () => {
    const rows = await cms.settings();
    const settings: Record<string, string> = {};
    for (const row of rows) settings[String(row.key)] = String(row.value);
    return reply.send({ ok: true, settings });
  }));

  app.get("/v1/public/cms/pages", async (_req, reply) => guard(reply, async () =>
    reply.send({ ok: true, pages: await cms.pages(true) })));

  app.get("/v1/public/cms/pages/:slug", async (req, reply) => guard(reply, async () => {
    const page = await cms.page((req.params as { slug: string }).slug, true);
    if (!page) return reply.code(404).send({ error: "Page not found in CMS" });
    return reply.send({ ok: true, page });
  }));

  app.get("/v1/public/cms/articles", async (req, reply) => guard(reply, async () => {
    const q = req.query as { type?: string; tag?: string; limit?: string };
    const limit = Math.min(Number(q.limit) || 20, 100);
    const articles = await cms.articles({ publishedOnly: true, type: q.type || "blog", tag: q.tag, limit });
    return reply.send({ ok: true, articles });
  }));

  app.get("/v1/public/cms/articles/:slug", async (req, reply) => guard(reply, async () => {
    const article = await cms.article({ slug: (req.params as { slug: string }).slug }, true);
    if (!article) return reply.code(404).send({ error: "Article not found" });
    return reply.send({ ok: true, article });
  }));

  app.get("/v1/public/cms/faqs", async (_req, reply) => guard(reply, async () =>
    reply.send({ ok: true, faqs: await cms.faqs(true) })));

  // Admin: login check
  app.post("/v1/admin/cms/auth/verify", async (req, reply) => {
    const body = req.body as { key?: unknown } | null;
    if (!adminKey || typeof body?.key !== "string" || !sameSecret(body.key, adminKey)) {
      return reply.code(401).send({ ok: false, error: "Invalid admin key" });
    }
    return reply.send({ ok: true, message: "Admin authenticated successfully" });
  });

  app.get("/v1/admin/cms/overview", { preHandler: adminOnly }, async (_req, reply) => guard(reply, async () => {
    const counts = await cms.counts();
    const recentLeads = await leads.recent(5);
    return reply.send({
      ok: true,
      stats: { totalPages: counts.pages, totalArticles: counts.articles, totalFaqs: counts.faqs, totalLeads: await leads.total() },
      recentLeads,
    });
  }));

  // Admin: settings
  app.get("/v1/admin/cms/settings", { preHandler: adminOnly }, async (_req, reply) => guard(reply, async () =>
    reply.send({ ok: true, settings: await cms.settings() })));

  app.put("/v1/admin/cms/settings", { preHandler: adminOnly }, async (req, reply) => guard(reply, async () => {
    const body = req.body as { settings?: Record<string, unknown> } | null;
    if (!body?.settings || typeof body.settings !== "object") return reply.code(400).send({ error: "Missing settings object" });
    for (const [key, value] of Object.entries(body.settings)) await cms.setSetting(key, String(value));
    return reply.send({ ok: true, message: "Settings saved successfully" });
  }));

  // Admin: pages
  app.get("/v1/admin/cms/pages", { preHandler: adminOnly }, async (_req, reply) => guard(reply, async () =>
    reply.send({ ok: true, pages: await cms.pages(false) })));

  app.put("/v1/admin/cms/pages/:slug", { preHandler: adminOnly }, async (req, reply) => guard(reply, async () => {
    const parsed = parsePage(req.body);
    if (!parsed.ok) return reply.code(400).send({ error: parsed.issues });
    const slug = (req.params as { slug: string }).slug;
    return reply.send({ ok: true, page: await cms.upsertPage(slug, parsed.value as unknown as Row) });
  }));

  // Admin: articles
  app.get("/v1/admin/cms/articles", { preHandler: adminOnly }, async (_req, reply) => guard(reply, async () =>
    reply.send({ ok: true, articles: await cms.articles({ publishedOnly: false, limit: 500 }) })));

  app.post("/v1/admin/cms/articles", { preHandler: adminOnly }, async (req, reply) => guard(reply, async () => {
    const parsed = parseArticle(req.body);
    if (!parsed.ok) return reply.code(400).send({ error: parsed.issues });
    try {
      return reply.code(201).send({ ok: true, article: await cms.createArticle(parsed.value as unknown as Row) });
    } catch (error) {
      if (error instanceof Error && /duplicate|unique/i.test(error.message)) return reply.code(409).send({ error: "An article with this slug already exists" });
      throw error;
    }
  }));

  app.put("/v1/admin/cms/articles/:id", { preHandler: adminOnly }, async (req, reply) => guard(reply, async () => {
    const parsed = parseArticle(req.body);
    if (!parsed.ok) return reply.code(400).send({ error: parsed.issues });
    const article = await cms.updateArticle((req.params as { id: string }).id, parsed.value as unknown as Row);
    if (!article) return reply.code(404).send({ error: "Article not found" });
    return reply.send({ ok: true, article });
  }));

  app.delete("/v1/admin/cms/articles/:id", { preHandler: adminOnly }, async (req, reply) => guard(reply, async () => {
    await cms.deleteArticle((req.params as { id: string }).id);
    return reply.send({ ok: true, message: "Article deleted" });
  }));

  // Admin: FAQs
  app.get("/v1/admin/cms/faqs", { preHandler: adminOnly }, async (_req, reply) => guard(reply, async () =>
    reply.send({ ok: true, faqs: await cms.faqs(false) })));

  app.post("/v1/admin/cms/faqs", { preHandler: adminOnly }, async (req, reply) => guard(reply, async () => {
    const parsed = parseFaq(req.body);
    if (!parsed.ok) return reply.code(400).send({ error: parsed.issues });
    return reply.code(201).send({ ok: true, faq: await cms.createFaq(parsed.value as unknown as Row) });
  }));

  app.put("/v1/admin/cms/faqs/:id", { preHandler: adminOnly }, async (req, reply) => guard(reply, async () => {
    const parsed = parseFaq(req.body);
    if (!parsed.ok) return reply.code(400).send({ error: parsed.issues });
    const faq = await cms.updateFaq((req.params as { id: string }).id, parsed.value as unknown as Row);
    if (!faq) return reply.code(404).send({ error: "FAQ not found" });
    return reply.send({ ok: true, faq });
  }));

  app.delete("/v1/admin/cms/faqs/:id", { preHandler: adminOnly }, async (req, reply) => guard(reply, async () => {
    await cms.deleteFaq((req.params as { id: string }).id);
    return reply.send({ ok: true, message: "FAQ deleted" });
  }));

  // Admin: leads (read only; the public form writes them)
  app.get("/v1/admin/cms/leads", { preHandler: adminOnly }, async (_req, reply) => guard(reply, async () =>
    reply.send({ ok: true, leads: await leads.recent(100) })));
}
