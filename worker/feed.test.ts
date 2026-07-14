import { describe, expect, it, vi } from "vite-plus/test";

import { createFeedHandler } from "./handler";

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Example feed</title><link>https://example.com/</link>
<description>Useful updates</description><item><guid>one</guid><title>First</title>
<link>https://example.com/posts/one</link><description>Summary</description></item>
<item><guid>unsafe</guid><title>Unsafe</title><link>http://example.com/posts/two</link></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom example</title>
<link rel="alternate" href="https://example.com/"/><subtitle>Atom updates</subtitle>
<entry><id>tag:example.com,2026:first</id><title>Atom first</title>
<link rel="alternate" href="https://example.com/atom-first"/><updated>2026-07-14T08:00:00Z</updated>
<author><name>Ada</name></author><summary>Summary</summary></entry></feed>`;

function request(
  target = "https://reader.example/api/feed?url=https%3A%2F%2Fexample.com%2Ffeed.xml",
) {
  return new Request(target);
}

describe("GET /api/feed", () => {
  it("returns a normalized RSS feed and omits unsafe article URLs", async () => {
    const fetchUpstream = vi.fn(
      async () => new Response(RSS, { headers: { "content-type": "application/rss+xml" } }),
    );
    const response = await createFeedHandler({ fetchUpstream })(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ready",
      feed: {
        url: "https://example.com/feed.xml",
        siteUrl: "https://example.com/",
        title: "Example feed",
      },
      articles: [{ guid: "one", title: "First", url: "https://example.com/posts/one" }],
    });
  });

  it("normalizes an Atom feed", async () => {
    const fetchUpstream = vi.fn(
      async () => new Response(ATOM, { headers: { "content-type": "application/atom+xml" } }),
    );
    const response = await createFeedHandler({ fetchUpstream })(request());

    expect(await response.json()).toMatchObject({
      status: "ready",
      feed: { title: "Atom example", siteUrl: "https://example.com/" },
      articles: [
        {
          guid: "tag:example.com,2026:first",
          title: "Atom first",
          url: "https://example.com/atom-first",
          author: "Ada",
          publishedAt: "2026-07-14T08:00:00.000Z",
        },
      ],
    });
  });

  it.each([
    ["missing URL", "https://reader.example/api/feed", "missing_url"],
    ["HTTP URL", "https://reader.example/api/feed?url=http%3A%2F%2Fexample.com", "invalid_url"],
    [
      "credentials",
      "https://reader.example/api/feed?url=https%3A%2F%2Fuser%3Apass%40example.com",
      "invalid_url",
    ],
    [
      "localhost",
      "https://reader.example/api/feed?url=https%3A%2F%2Flocalhost%2Ffeed",
      "blocked_destination",
    ],
    [
      "private IPv4",
      "https://reader.example/api/feed?url=https%3A%2F%2F10.0.0.1%2Ffeed",
      "blocked_destination",
    ],
    [
      "IPv6",
      "https://reader.example/api/feed?url=https%3A%2F%2F%5B%3A%3A1%5D%2Ffeed",
      "blocked_destination",
    ],
    [
      "nonstandard port",
      "https://reader.example/api/feed?url=https%3A%2F%2Fexample.com%3A8443%2Ffeed",
      "invalid_url",
    ],
  ])("rejects %s with a structured error", async (_label, target, code) => {
    const fetchUpstream = vi.fn();
    const response = await createFeedHandler({ fetchUpstream })(request(target));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ status: "error", code });
    expect(fetchUpstream).not.toHaveBeenCalled();
  });

  it("validates every redirect before following it", async () => {
    const fetchUpstream = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: "http://10.0.0.1/feed" } }),
    );
    const response = await createFeedHandler({ fetchUpstream })(request());

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ status: "error", code: "unsafe_redirect" });
    expect(fetchUpstream).toHaveBeenCalledTimes(1);
  });

  it("stops after the configured redirect limit", async () => {
    const fetchUpstream = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: "https://example.com/next" } }),
    );
    const response = await createFeedHandler({ fetchUpstream, maxRedirects: 1 })(request());

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ status: "error", code: "too_many_redirects" });
    expect(fetchUpstream).toHaveBeenCalledTimes(2);
  });

  it("returns a timeout error when the upstream deadline expires", async () => {
    const fetchUpstream = vi.fn(async () => {
      throw new DOMException("Timed out", "TimeoutError");
    });
    const response = await createFeedHandler({ fetchUpstream })(request());

    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ status: "error", code: "upstream_timeout" });
  });

  it("logs a safe structured diagnostic when the runtime rejects an outbound fetch", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secretMessage = "connect failed for https://private.example/feed?token=do-not-log";
    const failure = new TypeError(secretMessage, { cause: { code: "ECONNRESET" } });
    const fetchUpstream = vi.fn(async () => {
      throw failure;
    });

    const response = await createFeedHandler({ fetchUpstream })(request());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      status: "error",
      code: "upstream_unavailable",
      message: "The upstream feed could not be reached.",
    });
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({
        level: "error",
        event: "upstream_fetch_failed",
        category: "network",
        errorName: "TypeError",
        causeCode: "ECONNRESET",
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(secretMessage);
    log.mockRestore();
  });

  it("invokes an injected native fetch without binding it to the options object", async () => {
    const fetchUpstream = vi.fn(function (this: unknown) {
      if (this !== undefined) throw new TypeError("Illegal invocation");
      return Promise.resolve(
        new Response(RSS, { headers: { "content-type": "application/rss+xml" } }),
      );
    }) as unknown as typeof fetch;

    const response = await createFeedHandler({ fetchUpstream })(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ready",
      feed: { title: "Example feed" },
    });
  });

  it("passes the retained cause to a trusted error reporter for future observability", async () => {
    const failure = new TypeError("native fetch failed");
    const fetchUpstream = vi.fn(async () => {
      throw failure;
    });
    const reportError = vi.fn();
    const dependencies = { fetchUpstream, reportError };

    const response = await createFeedHandler(dependencies)(request());

    expect(response.status).toBe(502);
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "upstream_unavailable",
        cause: failure,
      }),
      expect.objectContaining({
        event: "upstream_fetch_failed",
        category: "network",
      }),
    );
  });

  it("rejects an upstream body larger than the configured bound", async () => {
    const fetchUpstream = vi.fn(
      async () =>
        new Response("x".repeat(65), { headers: { "content-type": "application/rss+xml" } }),
    );
    const response = await createFeedHandler({ fetchUpstream, maxBodyBytes: 64 })(request());

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ status: "error", code: "response_too_large" });
  });

  it("returns discovered HTTPS feed choices from a website", async () => {
    const page = `<html><head>
      <link rel="alternate" type="application/rss+xml" title="News" href="/rss.xml">
      <link rel="alternate" type="application/atom+xml" title="Atom" href="https://feeds.example.com/atom.xml">
      <link rel="alternate" type="application/rss+xml" title="Unsafe" href="http://example.com/rss.xml">
    </head></html>`;
    const fetchUpstream = vi.fn(
      async () => new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } }),
    );
    const response = await createFeedHandler({ fetchUpstream })(
      request("https://reader.example/api/feed?url=https%3A%2F%2Fexample.com%2Fnews"),
    );

    expect(await response.json()).toEqual({
      status: "choices",
      choices: [
        { title: "News", url: "https://example.com/rss.xml" },
        { title: "Atom", url: "https://feeds.example.com/atom.xml" },
      ],
    });
  });

  it("returns a structured parse error for unsupported content", async () => {
    const fetchUpstream = vi.fn(
      async () => new Response("not a feed", { headers: { "content-type": "text/plain" } }),
    );
    const response = await createFeedHandler({ fetchUpstream })(request());

    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ status: "error", code: "unsupported_content" });
  });

  it("applies rate limiting before fetching upstream", async () => {
    const fetchUpstream = vi.fn();
    const response = await createFeedHandler({
      fetchUpstream,
      rateLimit: async () => false,
    })(request());

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ status: "error", code: "rate_limited" });
    expect(fetchUpstream).not.toHaveBeenCalled();
  });

  it("serves a cache hit without contacting upstream", async () => {
    const cached = Response.json({ status: "choices", choices: [] });
    const cache = { match: vi.fn(async () => cached), put: vi.fn() };
    const fetchUpstream = vi.fn();
    const response = await createFeedHandler({ fetchUpstream, cache })(request());

    expect(await response.json()).toEqual({ status: "choices", choices: [] });
    expect(fetchUpstream).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });
});
