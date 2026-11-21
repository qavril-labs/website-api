import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryCmsStore } from "../src/cms/store.js";
import { MemoryLeadStore } from "../src/store.js";

const KEY = "admin-key-for-tests-0123456789abcdef";
const SITE = "https://qavrillabs.com";

describe("CMS", () => {
  let app: ReturnType<typeof buildApp>;
  let cms: MemoryCmsStore;
  let leads: MemoryLeadStore;
  const admin = { "x-admin-key": KEY };

  beforeEach(async () => {
    cms = new MemoryCmsStore();
    leads = new MemoryLeadStore();
    app = buildApp({ store: leads, cms, adminKey: KEY, corsOrigins: [SITE] });
    await cms.setSetting("brand_name", "QAVRIL LABS");
    await cms.upsertPage("home", { title: "Home", metaDescription: "", kicker: "", heroHeadline: "", heroSubhead: "", heroBadge: "", contentJson: {}, isPublished: true });
    await cms.upsertPage("draft", { title: "Draft", metaDescription: "", kicker: "", heroHeadline: "", heroSubhead: "", heroBadge: "", contentJson: {}, isPublished: false });
  });

  const article = (over: Record<string, unknown> = {}) => ({
    slug: "first-post", title: "First post", contentMarkdown: "# Hello", type: "blog", isPublished: true, ...over,
  });

  it("serves published settings, pages and articles, and hides drafts", async () => {
    const settings = await app.inject({ method: "GET", url: "/v1/public/cms/settings" });
    expect(settings.json()).toEqual({ ok: true, settings: { brand_name: "QAVRIL LABS" } });

    const pages = await app.inject({ method: "GET", url: "/v1/public/cms/pages" });
    expect(pages.json().pages.map((p: { slug: string }) => p.slug)).toEqual(["home"]);

    const draft = await app.inject({ method: "GET", url: "/v1/public/cms/pages/draft" });
    expect(draft.statusCode).toBe(404);
  });

  it("refuses admin routes without the key, and with the wrong key", async () => {
    const none = await app.inject({ method: "GET", url: "/v1/admin/cms/pages" });
    expect(none.statusCode).toBe(401);
    const wrong = await app.inject({ method: "GET", url: "/v1/admin/cms/pages", headers: { "x-admin-key": "nope" } });
    expect(wrong.statusCode).toBe(401);
    const bearer = await app.inject({ method: "GET", url: "/v1/admin/cms/pages", headers: { authorization: `Bearer ${KEY}` } });
    expect(bearer.statusCode).toBe(200);
  });

  it("refuses every admin route when no admin key is configured", async () => {
    const closed = buildApp({ store: new MemoryLeadStore(), cms: new MemoryCmsStore(), corsOrigins: [] });
    const res = await closed.inject({ method: "GET", url: "/v1/admin/cms/pages", headers: { "x-admin-key": KEY } });
    expect(res.statusCode).toBe(401);
    const login = await closed.inject({ method: "POST", url: "/v1/admin/cms/auth/verify", payload: { key: KEY } });
    expect(login.statusCode).toBe(401);
  });

  it("verifies the admin key at login", async () => {
    const ok = await app.inject({ method: "POST", url: "/v1/admin/cms/auth/verify", payload: { key: KEY } });
    expect(ok.json()).toEqual({ ok: true, message: "Admin authenticated successfully" });
    const bad = await app.inject({ method: "POST", url: "/v1/admin/cms/auth/verify", payload: { key: "x" } });
    expect(bad.statusCode).toBe(401);
  });

  it("creates, publishes, updates and deletes an article", async () => {
    const created = await app.inject({ method: "POST", url: "/v1/admin/cms/articles", headers: admin, payload: article() });
    expect(created.statusCode).toBe(201);
    const id = created.json().article.id as string;

    const publicList = await app.inject({ method: "GET", url: "/v1/public/cms/articles?type=blog" });
    expect(publicList.json().articles.map((a: { slug: string }) => a.slug)).toEqual(["first-post"]);

    const updated = await app.inject({ method: "PUT", url: `/v1/admin/cms/articles/${id}`, headers: admin, payload: article({ title: "Renamed", isPublished: false }) });
    expect(updated.json().article.title).toBe("Renamed");
    const hidden = await app.inject({ method: "GET", url: "/v1/public/cms/articles/first-post" });
    expect(hidden.statusCode).toBe(404);

    const removed = await app.inject({ method: "DELETE", url: `/v1/admin/cms/articles/${id}`, headers: admin });
    expect(removed.json()).toEqual({ ok: true, message: "Article deleted" });
  });

  it("refuses a duplicate article slug with a clear message", async () => {
    await app.inject({ method: "POST", url: "/v1/admin/cms/articles", headers: admin, payload: article() });
    const again = await app.inject({ method: "POST", url: "/v1/admin/cms/articles", headers: admin, payload: article() });
    expect(again.statusCode).toBe(409);
  });

  it("validates article bodies with the same rules as before", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/admin/cms/articles", headers: admin, payload: { slug: "", title: "", contentMarkdown: "", type: "vlog" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.length).toBeGreaterThanOrEqual(3);
  });

  it("creates, lists and updates FAQs; the public sees only active ones", async () => {
    const created = await app.inject({ method: "POST", url: "/v1/admin/cms/faqs", headers: admin, payload: { category: "General", question: "Q?", answer: "A.", sortOrder: 1 } });
    expect(created.statusCode).toBe(201);
    const id = created.json().faq.id as string;
    await app.inject({ method: "POST", url: "/v1/admin/cms/faqs", headers: admin, payload: { category: "General", question: "Hidden?", answer: "No.", isActive: false } });

    const publicFaqs = await app.inject({ method: "GET", url: "/v1/public/cms/faqs" });
    expect(publicFaqs.json().faqs.map((f: { question: string }) => f.question)).toEqual(["Q?"]);

    const adminFaqs = await app.inject({ method: "GET", url: "/v1/admin/cms/faqs", headers: admin });
    expect(adminFaqs.json().faqs).toHaveLength(2);

    const updated = await app.inject({ method: "PUT", url: `/v1/admin/cms/faqs/${id}`, headers: admin, payload: { category: "General", question: "Q2?", answer: "A.", sortOrder: 2, isActive: true } });
    expect(updated.json().faq.question).toBe("Q2?");
  });

  it("saves page content and settings through the admin", async () => {
    const page = await app.inject({ method: "PUT", url: "/v1/admin/cms/pages/products", headers: admin, payload: { title: "Products" } });
    expect(page.json().page.slug).toBe("products");
    const badPage = await app.inject({ method: "PUT", url: "/v1/admin/cms/pages/products", headers: admin, payload: { title: "" } });
    expect(badPage.statusCode).toBe(400);

    const saved = await app.inject({ method: "PUT", url: "/v1/admin/cms/settings", headers: admin, payload: { settings: { tagline: "BUILD." } } });
    expect(saved.json().ok).toBe(true);
    const settings = await app.inject({ method: "GET", url: "/v1/public/cms/settings" });
    expect(settings.json().settings.tagline).toBe("BUILD.");
  });

  it("shows the admin the leads, the overview counts, and the recent leads", async () => {
    await app.inject({
      method: "POST", url: "/v1/public/leads", remoteAddress: "203.0.113.9",
      payload: { name: "Asha", email: "asha@example.com", interest: "demo", consent: true },
    });
    const list = await app.inject({ method: "GET", url: "/v1/admin/cms/leads", headers: admin });
    expect(list.json().leads).toHaveLength(1);
    expect(list.json().leads[0].email).toBe("asha@example.com");

    const overview = await app.inject({ method: "GET", url: "/v1/admin/cms/overview", headers: admin });
    expect(overview.json().stats).toEqual({ totalPages: 2, totalArticles: 0, totalFaqs: 0, totalLeads: 1 });
    expect(overview.json().recentLeads).toHaveLength(1);
  });
});
