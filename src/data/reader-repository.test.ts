import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import type { NormalizedArticle } from "../domain/types";
import { ReaderRepository } from "./reader-repository";

const feed = {
  url: "https://example.com/feed.xml",
  siteUrl: "https://example.com/",
  title: "Example feed",
  description: "Updates from Example",
};

describe("ReaderRepository", () => {
  let repository: ReaderRepository;

  beforeEach(() => {
    repository = new ReaderRepository(`reader-test-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    await repository.delete();
  });

  it("migrates legacy articles to the current read/star and ordering schema", async () => {
    const databaseName = repository.database.name;
    repository.close();
    const legacy = new Dexie(databaseName);
    legacy.version(1).stores({
      feeds: "&id,&url,addedAt,refreshedAt",
      articles: "&id,feedId,[feedId+sortAt],sortAt,readAt",
      settings: "&key",
    });
    await legacy.open();
    await legacy.table("feeds").put({
      id: "legacy-feed",
      url: "https://example.com/feed.xml",
      title: "Legacy",
      addedAt: "2026-07-14T08:00:00.000Z",
    });
    await legacy.table("articles").put({
      id: "legacy-article",
      feedId: "legacy-feed",
      url: "https://example.com/article",
      title: "Legacy article",
      publishedAt: "2026-07-14T09:00:00.000Z",
    });
    legacy.close();

    repository = new ReaderRepository(databaseName);
    await repository.open();

    await expect(repository.listArticles()).resolves.toMatchObject([
      { id: "legacy-article", starred: false },
    ]);
  });

  it("subscribes once per canonical HTTPS feed URL and updates feed metadata", async () => {
    const first = await repository.subscribeFeed(feed, "2026-07-14T08:00:00.000Z");
    const duplicate = await repository.subscribeFeed({
      ...feed,
      url: "https://EXAMPLE.com:443/feed.xml#fragment",
      title: "Renamed feed",
    });

    expect(duplicate.id).toBe(first.id);
    expect(await repository.listFeeds()).toEqual([
      expect.objectContaining({
        id: first.id,
        url: "https://example.com/feed.xml",
        title: "Renamed feed",
        addedAt: "2026-07-14T08:00:00.000Z",
      }),
    ]);

    const updated = await repository.updateFeed(first.id, {
      refreshedAt: "2026-07-14T09:00:00.000Z",
      error: "Upstream unavailable",
    });
    expect(updated).toEqual(
      expect.objectContaining({
        refreshedAt: "2026-07-14T09:00:00.000Z",
        error: "Upstream unavailable",
      }),
    );
  });

  it("rejects subscription URLs that are not absolute HTTPS URLs", async () => {
    await expect(
      repository.subscribeFeed({ ...feed, url: "http://example.com/feed.xml" }),
    ).rejects.toThrow(/HTTPS/);
    await expect(repository.subscribeFeed({ ...feed, url: "not a URL" })).rejects.toThrow(/HTTPS/);

    for (const unsafeUrl of [
      "https://user:password@example.com/feed.xml",
      "https://127.0.0.1/feed.xml",
      "https://[::1]/feed.xml",
      "https://localhost/feed.xml",
      "https://intranet/feed.xml",
      "https://example.com:8443/feed.xml",
    ]) {
      await expect(repository.subscribeFeed({ ...feed, url: unsafeUrl })).rejects.toThrow(
        /safe public HTTPS URL/,
      );
    }
  });

  it("validates site URLs when subscribing and updating a feed", async () => {
    await expect(
      repository.subscribeFeed({ ...feed, siteUrl: "https://localhost/" }),
    ).rejects.toThrow(/safe public HTTPS URL/);

    const subscribed = await repository.subscribeFeed(feed);
    await expect(
      repository.updateFeed(subscribed.id, { siteUrl: "https://192.168.1.20/" }),
    ).rejects.toThrow(/safe public HTTPS URL/);
  });

  it("rejects unsafe non-empty article URLs", async () => {
    const subscribed = await repository.subscribeFeed(feed);

    for (const unsafeUrl of [
      "http://example.com/post",
      "https://user:password@example.com/post",
      "https://10.0.0.1/post",
      "https://localhost/post",
      "https://example.com:9443/post",
    ]) {
      await expect(
        repository.ingestArticles(subscribed.id, [{ url: unsafeUrl, title: "Unsafe article" }]),
      ).rejects.toThrow(/HTTPS URL/);
    }
  });

  it("deduplicates articles by GUID, then canonical HTTPS URL, then content", async () => {
    const subscribed = await repository.subscribeFeed(feed);
    const articles: NormalizedArticle[] = [
      {
        guid: "post-1",
        url: "https://example.com/posts/one",
        title: "Original title",
      },
      {
        guid: "post-1",
        url: "https://example.com/posts/one-renamed",
        title: "Updated title",
      },
      {
        url: "https://EXAMPLE.com:443/posts/two#comments",
        title: "Second post",
      },
      {
        url: "https://example.com/posts/two",
        title: "Second post updated",
      },
      { url: "", title: "No permalink", excerpt: "Stable summary" },
      { url: "", title: "No permalink", excerpt: "Stable summary" },
    ];

    await repository.ingestArticles(subscribed.id, articles);
    const stored = await repository.listArticles({ feedId: subscribed.id });

    expect(stored).toHaveLength(3);
    expect(stored.map(({ title }) => title)).toEqual([
      "No permalink",
      "Second post updated",
      "Updated title",
    ]);
  });

  it("preserves read and starred state when a known article is refreshed", async () => {
    const subscribed = await repository.subscribeFeed(feed);
    const [article] = await repository.ingestArticles(subscribed.id, [
      { guid: "post-1", url: "https://example.com/one", title: "First title" },
    ]);
    await repository.markRead(article.id, true, "2026-07-14T10:00:00.000Z");
    await repository.setStarred(article.id, true);

    await repository.ingestArticles(subscribed.id, [
      { guid: "post-1", url: "https://example.com/one", title: "Revised title" },
    ]);

    expect(await repository.getArticle(article.id)).toEqual(
      expect.objectContaining({
        title: "Revised title",
        readAt: "2026-07-14T10:00:00.000Z",
        starred: true,
      }),
    );
  });

  it("filters articles and toggles read and starred state", async () => {
    const subscribed = await repository.subscribeFeed(feed);
    const [first, second] = await repository.ingestArticles(subscribed.id, [
      {
        guid: "first",
        url: "https://example.com/first",
        title: "First",
        publishedAt: "2026-07-14T08:00:00.000Z",
      },
      {
        guid: "second",
        url: "https://example.com/second",
        title: "Second",
        publishedAt: "2026-07-14T09:00:00.000Z",
      },
    ]);

    await repository.markRead(first.id, true, "2026-07-14T10:00:00.000Z");
    await repository.setStarred(second.id, true);

    expect(await repository.listArticles({ unread: true })).toEqual([
      expect.objectContaining({ id: second.id }),
    ]);
    expect(await repository.listArticles({ starred: true })).toEqual([
      expect.objectContaining({ id: second.id }),
    ]);

    expect(await repository.markRead(first.id, false)).not.toHaveProperty("readAt");
    expect(await repository.setStarred(second.id, false)).toEqual(
      expect.objectContaining({ starred: false }),
    );
  });

  it("permanently deletes one article and purges only read articles", async () => {
    const subscribed = await repository.subscribeFeed(feed);
    const [unread, read, anotherRead] = await repository.ingestArticles(subscribed.id, [
      { guid: "unread", url: "https://example.com/unread", title: "Unread" },
      { guid: "read", url: "https://example.com/read", title: "Read" },
      { guid: "read-2", url: "https://example.com/read-2", title: "Read two" },
    ]);
    await repository.markRead(read.id);
    await repository.markRead(anotherRead.id);

    await repository.deleteArticle(read.id);
    expect(await repository.getArticle(read.id)).toBeUndefined();

    await expect(repository.purgeReadArticles()).resolves.toBe(1);
    expect(await repository.listArticles()).toEqual([expect.objectContaining({ id: unread.id })]);
  });

  it("keeps only the latest 200 non-starred articles per feed while retaining stars", async () => {
    const subscribed = await repository.subscribeFeed(feed);
    const normalized = Array.from({ length: 202 }, (_, index) => ({
      guid: `post-${index}`,
      url: `https://example.com/${index}`,
      title: `Post ${index}`,
      publishedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    }));

    const firstBatch = await repository.ingestArticles(subscribed.id, normalized.slice(0, 2));
    await repository.setStarred(firstBatch[0].id, true);
    await repository.ingestArticles(subscribed.id, normalized.slice(2));

    const stored = await repository.listArticles({ feedId: subscribed.id });
    expect(stored).toHaveLength(201);
    expect(stored.some(({ id }) => id === firstBatch[0].id)).toBe(true);
    expect(stored.some(({ id }) => id === firstBatch[1].id)).toBe(false);
  });

  it("prunes an old retained article after it is unstarred", async () => {
    const subscribed = await repository.subscribeFeed(feed);
    const [oldest] = await repository.ingestArticles(subscribed.id, [
      {
        guid: "oldest",
        url: "https://example.com/oldest",
        title: "Oldest",
        publishedAt: "2025-01-01T00:00:00.000Z",
      },
    ]);
    await repository.setStarred(oldest.id, true);
    await repository.ingestArticles(
      subscribed.id,
      Array.from({ length: 200 }, (_, index) => ({
        guid: `new-${index}`,
        url: `https://example.com/new-${index}`,
        title: `New ${index}`,
        publishedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      })),
    );

    await repository.setStarred(oldest.id, false);
    expect(await repository.getArticle(oldest.id)).toBeUndefined();
  });

  it("deleting a feed cascades to its articles without affecting other feeds", async () => {
    const firstFeed = await repository.subscribeFeed(feed);
    const secondFeed = await repository.subscribeFeed({
      ...feed,
      url: "https://another.example/feed.xml",
      title: "Another feed",
    });
    await repository.ingestArticles(firstFeed.id, [
      { guid: "first", url: "https://example.com/first", title: "First" },
    ]);
    await repository.ingestArticles(secondFeed.id, [
      { guid: "second", url: "https://another.example/second", title: "Second" },
    ]);

    await repository.removeFeed(firstFeed.id);

    expect(await repository.getFeed(firstFeed.id)).toBeUndefined();
    expect(await repository.listArticles({ feedId: firstFeed.id })).toEqual([]);
    expect(await repository.listArticles({ feedId: secondFeed.id })).toHaveLength(1);
  });
});
