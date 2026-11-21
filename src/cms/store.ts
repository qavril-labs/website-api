// CMS storage. Rows keep the database's snake_case column names, because the admin page reads them
// that way. The in-memory store backs the tests; pg-store.ts implements the same interface.

import { randomUUID } from "node:crypto";

export type Row = Record<string, unknown>;

export interface CmsStore {
  settings(): Promise<Row[]>;
  setSetting(key: string, value: string): Promise<void>;

  pages(publishedOnly: boolean): Promise<Row[]>;
  page(slug: string, publishedOnly: boolean): Promise<Row | null>;
  upsertPage(slug: string, values: Row): Promise<Row>;

  articles(filter: { publishedOnly: boolean; type?: string; tag?: string; limit?: number }): Promise<Row[]>;
  article(key: { slug?: string; id?: string }, publishedOnly: boolean): Promise<Row | null>;
  createArticle(values: Row): Promise<Row>;
  updateArticle(id: string, values: Row): Promise<Row | null>;
  deleteArticle(id: string): Promise<void>;

  faqs(activeOnly: boolean): Promise<Row[]>;
  createFaq(values: Row): Promise<Row>;
  updateFaq(id: string, values: Row): Promise<Row | null>;
  deleteFaq(id: string): Promise<void>;

  counts(): Promise<{ pages: number; articles: number; faqs: number }>;
}

const now = () => new Date().toISOString();


/** Maps the validated (camelCase) input to the stored (snake_case) row, as the Postgres store does. */
export function pageRow(v: Row): Row {
  return {
    title: v.title, meta_description: v.metaDescription, kicker: v.kicker, hero_headline: v.heroHeadline,
    hero_subhead: v.heroSubhead, hero_badge: v.heroBadge, content_json: v.contentJson, is_published: v.isPublished,
  };
}
export function articleRow(v: Row): Row {
  return {
    slug: v.slug, type: v.type, title: v.title, excerpt: v.excerpt, content_markdown: v.contentMarkdown, author: v.author,
    read_time: v.readTime, category_tag: v.categoryTag, is_featured: v.isFeatured, is_published: v.isPublished,
  };
}
export function faqRow(v: Row): Row {
  return { category: v.category, question: v.question, answer: v.answer, sort_order: v.sortOrder, is_active: v.isActive };
}

/** In-memory CMS store for tests and local runs. */
export class MemoryCmsStore implements CmsStore {
  private settingRows = new Map<string, Row>();
  private pageRows = new Map<string, Row>();
  private articleRows: Row[] = [];
  private faqRows: Row[] = [];

  async settings() {
    return [...this.settingRows.values()];
  }
  async setSetting(key: string, value: string) {
    this.settingRows.set(key, { key, value, description: null, updated_at: now() });
  }

  async pages(publishedOnly: boolean) {
    return [...this.pageRows.values()].filter((p) => !publishedOnly || p.is_published === true).sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  }
  async page(slug: string, publishedOnly: boolean) {
    const p = this.pageRows.get(slug);
    return p && (!publishedOnly || p.is_published === true) ? p : null;
  }
  async upsertPage(slug: string, values: Row) {
    const existing = this.pageRows.get(slug);
    const row: Row = { ...pageRow(values), slug, created_at: existing?.created_at ?? now(), updated_at: now() };
    this.pageRows.set(slug, row);
    return row;
  }

  async articles(filter: { publishedOnly: boolean; type?: string; tag?: string; limit?: number }) {
    return this.articleRows
      .filter((a) => !filter.publishedOnly || a.is_published === true)
      .filter((a) => !filter.type || a.type === filter.type)
      .filter((a) => !filter.tag || a.category_tag === filter.tag)
      .sort((a, b) => Number(b.is_featured) - Number(a.is_featured) || String(b.published_at).localeCompare(String(a.published_at)))
      .slice(0, filter.limit ?? 20);
  }
  async article(key: { slug?: string; id?: string }, publishedOnly: boolean) {
    return this.articleRows.find((a) => (key.slug ? a.slug === key.slug : a.id === key.id) && (!publishedOnly || a.is_published === true)) ?? null;
  }
  async createArticle(values: Row) {
    const row: Row = { ...articleRow(values), id: randomUUID(), published_at: now(), created_at: now(), updated_at: now() };
    if (this.articleRows.some((a) => a.slug === row.slug)) throw new Error("duplicate key value violates unique constraint");
    this.articleRows.push(row);
    return row;
  }
  async updateArticle(id: string, values: Row) {
    const row = this.articleRows.find((a) => a.id === id);
    if (!row) return null;
    Object.assign(row, articleRow(values), { updated_at: now() });
    return row;
  }
  async deleteArticle(id: string) {
    this.articleRows = this.articleRows.filter((a) => a.id !== id);
  }

  async faqs(activeOnly: boolean) {
    return this.faqRows
      .filter((f) => !activeOnly || f.is_active === true)
      .sort((a, b) => String(a.category).localeCompare(String(b.category)) || Number(a.sort_order) - Number(b.sort_order));
  }
  async createFaq(values: Row) {
    const row: Row = { ...faqRow(values), id: randomUUID(), created_at: now(), updated_at: now() };
    this.faqRows.push(row);
    return row;
  }
  async updateFaq(id: string, values: Row) {
    const row = this.faqRows.find((f) => f.id === id);
    if (!row) return null;
    Object.assign(row, faqRow(values), { updated_at: now() });
    return row;
  }
  async deleteFaq(id: string) {
    this.faqRows = this.faqRows.filter((f) => f.id !== id);
  }

  async counts() {
    return { pages: this.pageRows.size, articles: this.articleRows.length, faqs: this.faqRows.length };
  }
}
