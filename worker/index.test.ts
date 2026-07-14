import { describe, expect, it, vi } from "vite-plus/test";

import { createWorkerHandler } from "./app";

function environment(options?: { allowed?: boolean }) {
  return {
    FEED_RATE_LIMITER: { limit: vi.fn(async () => ({ success: options?.allowed ?? true })) },
    FEED_CACHE_TTL_SECONDS: "300",
    FEED_MAX_RESPONSE_BYTES: "1000000",
    VITE_API_ORIGIN: "",
    CORS_ALLOWED_ORIGINS: "",
  } satisfies Env;
}

describe("Worker entrypoint", () => {
  it("returns an API-only 404 for requests outside the feed endpoint", async () => {
    const env = environment();
    const request = new Request("https://reader.example/all");
    const response = await createWorkerHandler(env)(request);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("allows only configured Pages origins to call the feed API", async () => {
    const env = environment({ allowed: false });
    const request = {
      headers: {
        get: (name: string) => (name === "origin" ? "https://simple-reader.pages.dev" : null),
      },
      method: "GET",
      url: "https://api.example/api/feed?url=https%3A%2F%2Fexample.com%2Ffeed",
    } as Request;
    const response = await createWorkerHandler(env, {
      allowedOrigins: ["https://simple-reader.pages.dev"],
      cacheTtlSeconds: 300,
      maxResponseBytes: 1_000_000,
    })(request);

    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://simple-reader.pages.dev",
    );
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("does not grant cross-origin access to unconfigured sites", async () => {
    const env = environment({ allowed: false });
    const request = {
      headers: { get: (name: string) => (name === "origin" ? "https://untrusted.example" : null) },
      method: "GET",
      url: "https://api.example/api/feed?url=https%3A%2F%2Fexample.com%2Ffeed",
    } as Request;
    const response = await createWorkerHandler(env, {
      allowedOrigins: ["https://simple-reader.pages.dev"],
      cacheTtlSeconds: 300,
      maxResponseBytes: 1_000_000,
    })(request);

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
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
