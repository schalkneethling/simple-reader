import { describe, expect, it, vi } from "vite-plus/test";

import type {
  Article,
  Feed,
  FeedApiResponse,
  NormalizedArticle,
  NormalizedFeed,
} from "../domain/types";
import { LocalReaderService, requestFeedApi, type ReaderStorage } from "./reader-service";

function feed(id: string, refreshedAt?: string): Feed {
  return {
    id,
    url: `https://${id}.example/feed`,
    title: id,
    addedAt: "2026-01-01T00:00:00.000Z",
    refreshedAt,
  };
}

function storage(initialFeeds: Feed[] = []): ReaderStorage {
  const feeds = [...initialFeeds];
  const articles: Article[] = [];
  return {
    listFeeds: vi.fn(async () => [...feeds]),
    listArticles: vi.fn(async () => [...articles]),
    subscribeFeed: vi.fn(async (value: NormalizedFeed) => {
      const stored = feed(value.title);
      stored.url = value.url;
      feeds.push(stored);
      return stored;
    }),
    ingestArticles: vi.fn(async (feedId: string, values: NormalizedArticle[]) => {
      const stored = values.map((value, index) => ({
        id: `${feedId}-${index}`,
        feedId,
        url: value.url,
        title: value.title,
        starred: false,
      }));
      articles.push(...stored);
      return stored;
    }),
    updateFeed: vi.fn(async (id: string, updates: Partial<Omit<Feed, "id">>) => {
      const current = feeds.find((item) => item.id === id);
      if (!current) throw new Error("missing feed");
      Object.assign(current, updates);
      return { ...current };
    }),
    removeFeed: vi.fn(async () => undefined),
    markRead: vi.fn(async () => undefined),
    setStarred: vi.fn(async () => undefined),
    deleteArticle: vi.fn(async () => undefined),
    purgeReadArticles: vi.fn(async () => undefined),
  };
}

function ready(title: string): FeedApiResponse {
  return {
    status: "ready",
    feed: { url: `https://${title}.example/feed`, title },
    articles: [{ url: `https://${title}.example/article`, title: `${title} article` }],
    fetchedAt: "2026-07-14T10:00:00.000Z",
  };
}

describe("LocalReaderService", () => {
  it("persists individual and bulk read-article deletion", async () => {
    const repository = storage();
    const service = new LocalReaderService(repository, vi.fn());

    await service.deleteArticle("article-1");
    await service.purgeReadArticles();

    expect(repository.deleteArticle).toHaveBeenCalledWith("article-1");
    expect(repository.purgeReadArticles).toHaveBeenCalledOnce();
  });
  it("persists a normalized feed response when subscribing", async () => {
    const repository = storage();
    const request = vi.fn(async () => ready("news"));
    const service = new LocalReaderService(repository, request);

    const result = await service.addFeed("https://news.example/feed");

    expect(result.status).toBe("added");
    expect(repository.subscribeFeed).toHaveBeenCalledWith({
      url: "https://news.example/feed",
      title: "news",
    });
    expect(repository.ingestArticles).toHaveBeenCalledWith(
      "news",
      expect.any(Array),
      "2026-07-14T10:00:00.000Z",
    );
  });

  it("returns discovery choices without creating a subscription", async () => {
    const repository = storage();
    const service = new LocalReaderService(
      repository,
      vi.fn(async () => ({
        status: "choices" as const,
        choices: [{ url: "https://example.com/atom.xml", title: "Atom" }],
      })),
    );

    await expect(service.addFeed("https://example.com")).resolves.toEqual({
      status: "choices",
      choices: [{ url: "https://example.com/atom.xml", title: "Atom" }],
    });
    expect(repository.subscribeFeed).not.toHaveBeenCalled();
  });

  it("limits global refreshes to four concurrent requests", async () => {
    const feeds = Array.from({ length: 7 }, (_, index) => feed(`feed-${index}`));
    const repository = storage(feeds);
    let active = 0;
    let maximum = 0;
    const releases: Array<() => void> = [];
    const request = vi.fn(async (url: string) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return ready(new URL(url).hostname.split(".")[0]);
    });
    const service = new LocalReaderService(repository, request);

    const refreshing = service.refresh();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(4));
    for (let expectedCalls = 5; expectedCalls <= feeds.length; expectedCalls += 1) {
      releases.shift()?.();
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(expectedCalls));
    }
    while (releases.length > 0) releases.shift()?.();
    await refreshing;

    expect(maximum).toBe(4);
  });

  it("refreshes only stale feeds and records failures while preserving cached data", async () => {
    const now = new Date("2026-07-14T12:00:00.000Z");
    const stale = feed("stale", "2026-07-14T10:00:00.000Z");
    const fresh = feed("fresh", "2026-07-14T11:45:00.000Z");
    const repository = storage([stale, fresh]);
    const service = new LocalReaderService(
      repository,
      vi.fn(async () => ({
        status: "error" as const,
        code: "timeout",
        message: "Timed out",
      })),
    );

    await service.refreshStale(now);

    expect(repository.updateFeed).toHaveBeenCalledWith("stale", { error: "Timed out" });
    expect(repository.updateFeed).not.toHaveBeenCalledWith("fresh", expect.anything());
  });
});

describe("requestFeedApi", () => {
  it("uses the configured Worker origin when the frontend is hosted separately", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ status: "error", code: "not_found", message: "" }),
    );

    await requestFeedApi(
      "https://example.com/feed",
      fetcher,
      "https://simple-reader-api.example.workers.dev",
    );

    expect(fetcher).toHaveBeenCalledWith(
      "https://simple-reader-api.example.workers.dev/api/feed?url=https%3A%2F%2Fexample.com%2Ffeed",
      { headers: { accept: "application/json" } },
    );
  });

  it("rejects malformed JSON at the Worker-to-client trust boundary", async () => {
    const fetcher = vi.fn(async () => Response.json({ status: "ready" }));

    await expect(requestFeedApi("https://example.com/feed", fetcher)).rejects.toThrow(
      "invalid response",
    );
  });
});
