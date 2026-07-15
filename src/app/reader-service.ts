import type {
  Article,
  Feed,
  FeedApiResponse,
  NormalizedArticle,
  NormalizedFeed,
} from "../domain/types";
import type { ReaderService, RefreshResult, SubscriptionResult } from "./contracts";

export interface ReaderStorage {
  listFeeds: () => Promise<Feed[]>;
  listArticles: () => Promise<Article[]>;
  subscribeFeed: (feed: NormalizedFeed) => Promise<Feed>;
  ingestArticles: (
    feedId: string,
    articles: NormalizedArticle[],
    refreshedAt?: string,
  ) => Promise<Article[]>;
  updateFeed: (id: string, updates: Partial<Omit<Feed, "id">>) => Promise<Feed>;
  removeFeed: (id: string) => Promise<void>;
  markRead: (id: string, read: boolean) => Promise<unknown>;
  setStarred: (id: string, starred: boolean) => Promise<unknown>;
  deleteArticle: (id: string) => Promise<void>;
  purgeReadArticles: () => Promise<unknown>;
}

export type FeedRequest = (url: string) => Promise<FeedApiResponse>;

export class LocalReaderService implements ReaderService {
  private readonly storage: ReaderStorage;
  private readonly requestFeed: FeedRequest;

  constructor(storage: ReaderStorage, requestFeed: FeedRequest) {
    this.storage = storage;
    this.requestFeed = requestFeed;
  }

  async addFeed(url: string): Promise<SubscriptionResult> {
    const response = await this.requestFeed(url);
    if (response.status === "choices") return response;
    if (response.status === "error") return { status: "error", message: response.message };

    const feed = await this.storage.subscribeFeed(response.feed);
    const articles = await this.storage.ingestArticles(
      feed.id,
      response.articles,
      response.fetchedAt,
    );
    return { status: "added", feed, articles };
  }

  async refresh(feedId?: string): Promise<RefreshResult> {
    const feeds = await this.storage.listFeeds();
    const targets = feedId === undefined ? feeds : feeds.filter((feed) => feed.id === feedId);
    await runWithConcurrency(targets, 4, (feed) => this.refreshFeed(feed));
    return this.snapshot();
  }

  async refreshStale(now = new Date()): Promise<RefreshResult> {
    const staleBefore = now.getTime() - 30 * 60 * 1000;
    const feeds = await this.storage.listFeeds();
    const stale = feeds.filter((feed) => {
      const refreshedAt =
        feed.refreshedAt === undefined ? Number.NaN : Date.parse(feed.refreshedAt);
      return !Number.isFinite(refreshedAt) || refreshedAt <= staleBefore;
    });
    await runWithConcurrency(stale, 4, (feed) => this.refreshFeed(feed));
    return this.snapshot();
  }

  async removeFeed(feedId: string): Promise<void> {
    await this.storage.removeFeed(feedId);
  }

  async setRead(articleId: string, read: boolean): Promise<void> {
    await this.storage.markRead(articleId, read);
  }

  async setStarred(articleId: string, starred: boolean): Promise<void> {
    await this.storage.setStarred(articleId, starred);
  }

  async deleteArticle(articleId: string): Promise<void> {
    await this.storage.deleteArticle(articleId);
  }

  async purgeReadArticles(): Promise<void> {
    await this.storage.purgeReadArticles();
  }

  async snapshot(): Promise<RefreshResult> {
    const [feeds, articles] = await Promise.all([
      this.storage.listFeeds(),
      this.storage.listArticles(),
    ]);
    return { feeds, articles };
  }

  private async refreshFeed(feed: Feed): Promise<void> {
    try {
      const response = await this.requestFeed(feed.url);
      if (response.status === "ready") {
        await this.storage.ingestArticles(feed.id, response.articles, response.fetchedAt);
        await this.storage.updateFeed(feed.id, {
          title: response.feed.title,
          description: response.feed.description,
          siteUrl: response.feed.siteUrl,
          refreshedAt: response.fetchedAt,
          error: undefined,
        });
        return;
      }
      const message =
        response.status === "error"
          ? response.message
          : "The feed address now resolves to multiple feeds.";
      await this.storage.updateFeed(feed.id, { error: message });
    } catch {
      await this.storage.updateFeed(feed.id, { error: "The feed could not be refreshed." });
    }
  }
}

async function runWithConcurrency<Item>(
  items: Item[],
  limit: number,
  task: (item: Item) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      if (item !== undefined) await task(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export async function requestFeedApi(
  url: string,
  fetcher: typeof fetch = fetch,
  apiOrigin = import.meta.env.VITE_API_ORIGIN,
): Promise<FeedApiResponse> {
  const endpoint = new URL("/api/feed", apiOrigin || "https://simple-reader.local");
  endpoint.searchParams.set("url", url);
  const response = await fetcher(
    apiOrigin ? endpoint.href : `${endpoint.pathname}${endpoint.search}`,
    {
      headers: { accept: "application/json" },
    },
  );
  const body: unknown = await response.json();
  if (!isFeedApiResponse(body)) throw new Error("The feed service returned an invalid response.");
  return body;
}

function isFeedApiResponse(value: unknown): value is FeedApiResponse {
  if (!isRecord(value) || typeof value.status !== "string") return false;
  if (value.status === "error") {
    return typeof value.code === "string" && typeof value.message === "string";
  }
  if (value.status === "choices") {
    return Array.isArray(value.choices) && value.choices.every(isFeedChoice);
  }
  if (value.status !== "ready" || !isNormalizedFeed(value.feed)) return false;
  return (
    typeof value.fetchedAt === "string" &&
    Array.isArray(value.articles) &&
    value.articles.every(isNormalizedArticle)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOptionalStrings(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => value[key] === undefined || typeof value[key] === "string");
}

function isFeedChoice(value: unknown): boolean {
  return isRecord(value) && typeof value.url === "string" && typeof value.title === "string";
}

function isNormalizedFeed(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    typeof value.title === "string" &&
    hasOptionalStrings(value, ["siteUrl", "description"])
  );
}

function isNormalizedArticle(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    typeof value.title === "string" &&
    hasOptionalStrings(value, ["guid", "author", "publishedAt", "excerpt", "contentHtml"])
  );
}
