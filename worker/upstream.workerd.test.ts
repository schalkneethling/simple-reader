import { describe, expect, it } from "vite-plus/test";

import { fetchDocument } from "./upstream";

describe("fetchDocument in the Workers runtime", () => {
  it("detaches the provided fetch callback before invoking workerd fetch", async () => {
    const fetchUpstream: typeof fetch = function (this: unknown, ...args) {
      if (this !== undefined) throw new TypeError("Illegal invocation");
      return globalThis.fetch(...args);
    };

    const document = await fetchDocument(new URL("https://runtime-fixture.example/feed.xml"), {
      fetchUpstream,
      maxBodyBytes: 10_000,
      maxRedirects: 1,
      timeoutMs: 1_000,
    });

    expect(document).toMatchObject({
      contentType: "application/rss+xml",
      finalUrl: new URL("https://runtime-fixture.example/feed.xml"),
    });
    expect(document.body).toContain("<title>Runtime fixture</title>");
  });
});
