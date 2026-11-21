import type { Pool } from "pg";
import type { CmsStore, Row } from "./store.js";

/** Postgres CMS store. Column names match the migration, so rows come back in the admin's shape. */
export class PgCmsStore implements CmsStore {
  constructor(private readonly pool: Pool) {}

  private async q(sql: string, params: unknown[] = []): Promise<Row[]> {
    return (await this.pool.query(sql, params)).rows as Row[];
  }

  async settings() {
    return this.q("SELECT key, value, description, updated_at FROM cms_settings ORDER BY key ASC");
  }
  async setSetting(key: string, value: string) {
    await this.q(
      "INSERT INTO cms_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
      [key, value],
    );
  }

  async pages(publishedOnly: boolean) {
    return this.q(
      `SELECT slug, title, meta_description, kicker, hero_headline, hero_subhead, hero_badge, updated_at FROM cms_pages
        WHERE ($1::boolean = false OR is_published = true) ORDER BY slug ASC`,
      [publishedOnly],
    );
  }
  async page(slug: string, publishedOnly: boolean) {
    return (await this.q("SELECT * FROM cms_pages WHERE slug = $1 AND ($2::boolean = false OR is_published = true)", [slug, publishedOnly]))[0] ?? null;
  }
  async upsertPage(slug: string, v: Row) {
    return (await this.q(
      `INSERT INTO cms_pages (slug, title, meta_description, kicker, hero_headline, hero_subhead, hero_badge, content_json, is_published, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (slug) DO UPDATE SET title = $2, meta_description = $3, kicker = $4, hero_headline = $5, hero_subhead = $6,
         hero_badge = $7, content_json = $8, is_published = $9, updated_at = NOW()
       RETURNING *`,
      [slug, v.title, v.metaDescription, v.kicker, v.heroHeadline, v.heroSubhead, v.heroBadge, JSON.stringify(v.contentJson), v.isPublished],
    ))[0]!;
  }

  async articles(f: { publishedOnly: boolean; type?: string; tag?: string; limit?: number }) {
    return this.q(
      `SELECT id, slug, type, title, excerpt, author, read_time, category_tag, is_featured, published_at FROM cms_articles
        WHERE ($1::boolean = false OR is_published = true)
          AND ($2::text IS NULL OR type = $2) AND ($3::text IS NULL OR category_tag = $3)
        ORDER BY is_featured DESC, published_at DESC LIMIT $4`,
      [f.publishedOnly, f.type ?? null, f.tag ?? null, f.limit ?? 20],
    );
  }
  async article(key: { slug?: string; id?: string }, publishedOnly: boolean) {
    const rows = key.slug
      ? await this.q("SELECT * FROM cms_articles WHERE slug = $1 AND ($2::boolean = false OR is_published = true)", [key.slug, publishedOnly])
      : await this.q("SELECT * FROM cms_articles WHERE id = $1 AND ($2::boolean = false OR is_published = true)", [key.id, publishedOnly]);
    return rows[0] ?? null;
  }
  async createArticle(v: Row) {
    return (await this.q(
      `INSERT INTO cms_articles (slug, type, title, excerpt, content_markdown, author, read_time, category_tag, is_featured, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [v.slug, v.type, v.title, v.excerpt, v.contentMarkdown, v.author, v.readTime, v.categoryTag, v.isFeatured, v.isPublished],
    ))[0]!;
  }
  async updateArticle(id: string, v: Row) {
    return (await this.q(
      `UPDATE cms_articles SET slug = $1, type = $2, title = $3, excerpt = $4, content_markdown = $5, author = $6, read_time = $7,
         category_tag = $8, is_featured = $9, is_published = $10, updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [v.slug, v.type, v.title, v.excerpt, v.contentMarkdown, v.author, v.readTime, v.categoryTag, v.isFeatured, v.isPublished, id],
    ))[0] ?? null;
  }
  async deleteArticle(id: string) {
    await this.q("DELETE FROM cms_articles WHERE id = $1", [id]);
  }

  async faqs(activeOnly: boolean) {
    return this.q("SELECT * FROM cms_faqs WHERE ($1::boolean = false OR is_active = true) ORDER BY category ASC, sort_order ASC", [activeOnly]);
  }
  async createFaq(v: Row) {
    return (await this.q(
      "INSERT INTO cms_faqs (category, question, answer, sort_order, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [v.category, v.question, v.answer, v.sortOrder, v.isActive],
    ))[0]!;
  }
  async updateFaq(id: string, v: Row) {
    return (await this.q(
      "UPDATE cms_faqs SET category = $1, question = $2, answer = $3, sort_order = $4, is_active = $5, updated_at = NOW() WHERE id = $6 RETURNING *",
      [v.category, v.question, v.answer, v.sortOrder, v.isActive, id],
    ))[0] ?? null;
  }
  async deleteFaq(id: string) {
    await this.q("DELETE FROM cms_faqs WHERE id = $1", [id]);
  }

  async counts() {
    const [p, a, f] = await Promise.all([
      this.q("SELECT COUNT(*)::int AS n FROM cms_pages"),
      this.q("SELECT COUNT(*)::int AS n FROM cms_articles"),
      this.q("SELECT COUNT(*)::int AS n FROM cms_faqs"),
    ]);
    return { pages: Number(p[0]!.n), articles: Number(a[0]!.n), faqs: Number(f[0]!.n) };
  }
}
