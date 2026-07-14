import { describe, expect, it, vi } from "vite-plus/test";

import { createWorkerHandler } from "./app";

function environment(options?: { allowed?: boolean }) {
  return {
    ASSETS: {
      fetch: vi.fn(async () => new Response("app")),
      connect: vi.fn<Env["ASSETS"]["connect"]>(),
    },
    FEED_RATE_LIMITER: { limit: vi.fn(async () => ({ success: options?.allowed ?? true })) },
    FEED_CACHE_TTL_SECONDS: "300",
    FEED_MAX_RESPONSE_BYTES: "1000000",
  } satisfies Env;
}

describe("Worker entrypoint", () => {
  it("delegates non-API requests to static assets and adds security headers", async () => {
    const env = environment();
    const request = new Request("https://reader.example/all");
    const response = await createWorkerHandler(env)(request);

    expect(env.ASSETS.fetch).toHaveBeenCalledWith(request);
    expect(await response.text()).toBe("app");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("uses the rate-limit binding before fetching a feed", async () => {
    const env = environment({ allowed: false });
    const response = await createWorkerHandler(env)(
      new Request("https://reader.example/api/feed?url=https%3A%2F%2Fexample.com%2Ffeed"),
    );

    expect(env.FEED_RATE_LIMITER.limit).toHaveBeenCalledWith({ key: "anonymous" });
    expect(response.status).toBe(429);
  });
});
