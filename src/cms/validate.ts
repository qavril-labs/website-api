// Validation for the CMS write bodies. Mirrors the rules that were in the ERP monolith (zod), with
// the same defaults and limits, so the admin page keeps working unchanged.

export interface Issue {
  path: string;
  message: string;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

type Obj = Record<string, unknown>;

function obj(raw: unknown, issues: Issue[]): Obj | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    issues.push({ path: "", message: "body must be an object" });
    return null;
  }
  return raw as Obj;
}

function str(b: Obj, key: string, opts: { min?: number; max: number; def?: string }, issues: Issue[]): string {
  const v = b[key];
  if (v === undefined) {
    if (opts.def !== undefined) return opts.def;
    issues.push({ path: key, message: "required" });
    return "";
  }
  if (typeof v !== "string") {
    issues.push({ path: key, message: "must be text" });
    return "";
  }
  if (v.length < (opts.min ?? 0)) issues.push({ path: key, message: "is too short" });
  if (v.length > opts.max) issues.push({ path: key, message: `must be at most ${opts.max} characters` });
  return v;
}

function bool(b: Obj, key: string, def: boolean, issues: Issue[]): boolean {
  const v = b[key];
  if (v === undefined) return def;
  if (typeof v !== "boolean") {
    issues.push({ path: key, message: "must be true or false" });
    return def;
  }
  return v;
}

export function parsePage(raw: unknown): Parsed<{
  title: string; metaDescription: string; kicker: string; heroHeadline: string; heroSubhead: string; heroBadge: string;
  contentJson: Obj; isPublished: boolean;
}> {
  const issues: Issue[] = [];
  const b = obj(raw, issues);
  if (!b) return { ok: false, issues };
  const contentJson = b.contentJson === undefined ? {} : b.contentJson;
  if (typeof contentJson !== "object" || contentJson === null || Array.isArray(contentJson)) issues.push({ path: "contentJson", message: "must be an object" });
  const value = {
    title: str(b, "title", { min: 1, max: 200 }, issues),
    metaDescription: str(b, "metaDescription", { max: 10_000, def: "" }, issues),
    kicker: str(b, "kicker", { max: 10_000, def: "" }, issues),
    heroHeadline: str(b, "heroHeadline", { max: 10_000, def: "" }, issues),
    heroSubhead: str(b, "heroSubhead", { max: 10_000, def: "" }, issues),
    heroBadge: str(b, "heroBadge", { max: 10_000, def: "" }, issues),
    contentJson: (contentJson as Obj) ?? {},
    isPublished: bool(b, "isPublished", true, issues),
  };
  return issues.length ? { ok: false, issues } : { ok: true, value };
}

export const ARTICLE_TYPES = ["blog", "case_study", "news"] as const;
export type ArticleType = (typeof ARTICLE_TYPES)[number];

export function parseArticle(raw: unknown): Parsed<{
  slug: string; type: ArticleType; title: string; excerpt: string; contentMarkdown: string; author: string; readTime: string;
  categoryTag: string; isFeatured: boolean; isPublished: boolean;
}> {
  const issues: Issue[] = [];
  const b = obj(raw, issues);
  if (!b) return { ok: false, issues };
  const type = b.type === undefined ? "blog" : b.type;
  if (!ARTICLE_TYPES.includes(type as ArticleType)) issues.push({ path: "type", message: "must be blog, case_study or news" });
  const value = {
    slug: str(b, "slug", { min: 1, max: 160 }, issues),
    type: type as ArticleType,
    title: str(b, "title", { min: 1, max: 255 }, issues),
    excerpt: str(b, "excerpt", { max: 10_000, def: "" }, issues),
    contentMarkdown: str(b, "contentMarkdown", { min: 1, max: 1_000_000 }, issues),
    author: str(b, "author", { max: 100, def: "QAVRIL LABS Team" }, issues),
    readTime: str(b, "readTime", { max: 30, def: "5 min read" }, issues),
    categoryTag: str(b, "categoryTag", { max: 60, def: "General" }, issues),
    isFeatured: bool(b, "isFeatured", false, issues),
    isPublished: bool(b, "isPublished", true, issues),
  };
  return issues.length ? { ok: false, issues } : { ok: true, value };
}

export function parseFaq(raw: unknown): Parsed<{ category: string; question: string; answer: string; sortOrder: number; isActive: boolean }> {
  const issues: Issue[] = [];
  const b = obj(raw, issues);
  if (!b) return { ok: false, issues };
  const sort = b.sortOrder === undefined ? 0 : b.sortOrder;
  if (!Number.isInteger(sort)) issues.push({ path: "sortOrder", message: "must be a whole number" });
  const value = {
    category: str(b, "category", { min: 1, max: 80 }, issues),
    question: str(b, "question", { min: 1, max: 10_000 }, issues),
    answer: str(b, "answer", { min: 1, max: 100_000 }, issues),
    sortOrder: typeof sort === "number" ? sort : 0,
    isActive: bool(b, "isActive", true, issues),
  };
  return issues.length ? { ok: false, issues } : { ok: true, value };
}
