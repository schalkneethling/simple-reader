import type {
  Article,
  ArticleId,
  Feed,
  FeedId,
  NormalizedArticle,
  NormalizedFeed,
} from "../domain/types";
import { ReaderDatabase, type StoredArticle } from "./reader-database";

export interface ArticleFilter {
  feedId?: FeedId;
  unread?: boolean;
  starred?: boolean;
}

export class ReaderRepository {
  readonly database: ReaderDatabase;

  constructor(name = "simple-reader") {
    this.database = new ReaderDatabase(name);
  }

  async open(): Promise<void> {
    await this.database.open();
  }

  close(): void {
    this.database.close();
  }

  async delete(): Promise<void> {
    this.database.close();
    await this.database.delete();
  }

  async subscribeFeed(feed: NormalizedFeed, addedAt = new Date().toISOString()): Promise<Feed> {
    const url = requireHttpsUrl(feed.url);
    const id = stableId("feed", url);
    const existing = await this.database.feeds.get(id);
    const subscribed: Feed = {
      id,
      url,
      title: requiredText(feed.title, "Feed title"),
      addedAt: existing?.addedAt ?? addedAt,
      ...optionalText("siteUrl", normalizeOptionalHttpsUrl(feed.siteUrl)),
      ...optionalText("description", feed.description),
      ...optionalText("refreshedAt", existing?.refreshedAt),
      ...optionalText("error", existing?.error),
    };
    await this.database.feeds.put(subscribed);
    return cloneFeed(subscribed);
  }

  async updateFeed(id: FeedId, updates: Partial<Omit<Feed, "id">>): Promise<Feed> {
    const current = await this.database.feeds.get(id);
    if (!current) throw new Error(`Unknown feed: ${id}`);

    const nextUrl = updates.url === undefined ? current.url : requireHttpsUrl(updates.url);
    if (stableId("feed", nextUrl) !== id) {
      throw new Error("A feed URL cannot be changed to a different subscription");
    }

    const next: Feed = {
      ...current,
      ...updates,
      id,
      url: nextUrl,
      title: requiredText(updates.title ?? current.title, "Feed title"),
      ...optionalText(
        "siteUrl",
        updates.siteUrl === undefined
          ? current.siteUrl
          : normalizeOptionalHttpsUrl(updates.siteUrl),
      ),
    };
    stripUndefined(next);
    await this.database.feeds.put(next);
    return cloneFeed(next);
  }

  async getFeed(id: FeedId): Promise<Feed | undefined> {
    const feed = await this.database.feeds.get(id);
    return feed ? cloneFeed(feed) : undefined;
  }

  async listFeeds(): Promise<Feed[]> {
    const feeds = await this.database.feeds.toArray();
    return feeds.map(cloneFeed).sort((left, right) => left.title.localeCompare(right.title));
  }

  async removeFeed(id: FeedId): Promise<void> {
    await this.database.transaction("rw", this.database.feeds, this.database.articles, async () => {
      await this.database.articles.where("feedId").equals(id).delete();
      await this.database.feeds.delete(id);
    });
  }

  async ingestArticles(
    feedId: FeedId,
    articles: NormalizedArticle[],
    refreshedAt = new Date().toISOString(),
  ): Promise<Article[]> {
    return this.database.transaction(
      "rw",
      this.database.feeds,
      this.database.articles,
      async () => {
        const feed = await this.database.feeds.get(feedId);
        if (!feed) throw new Error(`Unknown feed: ${feedId}`);

        const ingested = new Map<ArticleId, StoredArticle>();
        const now = Date.now();
        const candidates = articles.map((normalized) => ({
          normalized,
          id: stableId(feedId, articleIdentity(normalized)),
        }));
        const candidateIds = [...new Set(candidates.map(({ id }) => id))];
        const existingArticles = await this.database.articles.bulkGet(candidateIds);
        const existingById = new Map(
          existingArticles.flatMap((article) => (article ? [[article.id, article]] : [])),
        );

        for (const [index, { normalized, id }] of candidates.entries()) {
          const existing = existingById.get(id);
          const ingestedAt = now + index;
          const publishedTime = normalized.publishedAt
            ? Date.parse(normalized.publishedAt)
            : Number.NaN;
          const stored: StoredArticle = {
            id,
            feedId,
            url: normalizeArticleUrl(normalized.url),
            title: requiredText(normalized.title, "Article title"),
            starred: existing?.starred ?? false,
            ingestedAt,
            sortAt: Number.isFinite(publishedTime) ? publishedTime : ingestedAt,
            ...optionalText("guid", normalized.guid),
            ...optionalText("author", normalized.author),
            ...optionalText("publishedAt", normalized.publishedAt),
            ...optionalText("excerpt", normalized.excerpt),
            ...optionalText("contentHtml", normalized.contentHtml),
            ...optionalText("readAt", existing?.readAt),
          };
          ingested.set(id, stored);
        }

        await this.database.articles.bulkPut([...ingested.values()]);

        await this.database.feeds.update(feedId, { refreshedAt, error: undefined });
        await this.pruneFeed(feedId);

        return [...ingested.values()].sort(compareStoredArticles).map(toArticle);
      },
    );
  }

  async getArticle(id: ArticleId): Promise<Article | undefined> {
    const article = await this.database.articles.get(id);
    return article ? toArticle(article) : undefined;
  }

  async listArticles(filter: ArticleFilter = {}): Promise<Article[]> {
    const stored = filter.feedId
      ? await this.database.articles.where("feedId").equals(filter.feedId).toArray()
      : await this.database.articles.toArray();

    return stored
      .filter(
        (article) =>
          (filter.unread === undefined || filter.unread === !article.readAt) &&
          (filter.starred === undefined || filter.starred === article.starred),
      )
      .sort(compareStoredArticles)
      .map(toArticle);
  }

  async markRead(id: ArticleId, read = true, readAt = new Date().toISOString()): Promise<Article> {
    const article = await this.requireArticle(id);
    const next: StoredArticle = { ...article };
    if (read) next.readAt = readAt;
    else delete next.readAt;
    await this.database.articles.put(next);
    return toArticle(next);
  }

  async setStarred(id: ArticleId, starred: boolean): Promise<Article> {
    return this.database.transaction("rw", this.database.articles, async () => {
      const article = await this.requireArticle(id);
      const next = { ...article, starred };
      await this.database.articles.put(next);
      if (!starred) await this.pruneFeed(article.feedId);
      return toArticle(next);
    });
  }

  private async requireArticle(id: ArticleId): Promise<StoredArticle> {
    const article = await this.database.articles.get(id);
    if (!article) throw new Error(`Unknown article: ${id}`);
    return article;
  }

  private async pruneFeed(feedId: FeedId): Promise<void> {
    const articles = await this.database.articles.where("feedId").equals(feedId).toArray();
    const excess = articles
      .filter(({ starred }) => !starred)
      .sort(compareStoredArticles)
      .slice(200)
      .map(({ id }) => id);
    if (excess.length > 0) await this.database.articles.bulkDelete(excess);
  }
}

function requireHttpsUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("Expected an absolute HTTPS URL");
  }
  if (url.protocol !== "https:") throw new TypeError("Expected an absolute HTTPS URL");
  if (!isSafePublicDestination(url)) {
    throw new TypeError("Expected a safe public HTTPS URL");
  }
  url.hash = "";
  return url.href;
}

function canonicalHttpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !isSafePublicDestination(url)) return undefined;
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

function isSafePublicDestination(url: URL): boolean {
  if (url.username || url.password || url.port) return false;

  const hostname = url.hostname.toLowerCase();
  if (
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    isIpLiteral(hostname)
  ) {
    return false;
  }

  return true;
}

function isIpLiteral(hostname: string): boolean {
  if (hostname.startsWith("[") && hostname.endsWith("]")) return true;
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function normalizeOptionalHttpsUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return requireHttpsUrl(value);
}

function normalizeArticleUrl(value: string): string {
  if (value === "") return "";
  return requireHttpsUrl(value);
}

function articleIdentity(article: NormalizedArticle): string {
  const guid = article.guid?.trim();
  if (guid) return `guid:${guid}`;
  const url = canonicalHttpsUrl(article.url);
  if (url) return `url:${url}`;
  return `content:${stableSerialize([
    article.title,
    article.author,
    article.publishedAt,
    article.excerpt,
    article.contentHtml,
  ])}`;
}

function stableSerialize(values: Array<string | undefined>): string {
  return JSON.stringify(values.map((value) => value ?? null));
}

function stableId(namespace: string, value: string): string {
  let hash = 0xcbf2_9ce4_8422_2325n;
  const input = `${namespace}\u0000${value}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100_0000_01b3n);
  }
  return `${namespace}:${hash.toString(16).padStart(16, "0")}`;
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} is required`);
  return normalized;
}

function optionalText<Key extends string>(
  key: Key,
  value: string | undefined,
): Partial<Record<Key, string>> {
  return value === undefined ? {} : ({ [key]: value } as Record<Key, string>);
}

function stripUndefined(record: object): void {
  const keyedRecord = record as Record<string, unknown>;
  for (const key of Object.keys(keyedRecord)) {
    if (keyedRecord[key] === undefined) delete keyedRecord[key];
  }
}

function cloneFeed(feed: Feed): Feed {
  return { ...feed };
}

function toArticle(stored: StoredArticle): Article {
  const { ingestedAt: _ingestedAt, sortAt: _sortAt, ...article } = stored;
  return { ...article };
}

function compareStoredArticles(left: StoredArticle, right: StoredArticle): number {
  return (
    right.sortAt - left.sortAt ||
    right.ingestedAt - left.ingestedAt ||
    left.id.localeCompare(right.id)
  );
}
