import { createFeedHandler, type FeedCache } from "./handler";

const SECURITY_HEADERS = {
  "content-security-policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' https:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
  ].join("; "),
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

export interface WorkerConfig {
  cacheTtlSeconds: number;
  maxResponseBytes: number;
}

function configuredPositiveInteger(value: string | number, fallback: number): number {
  const stringValue = String(value);
  if (!/^\d+$/.test(stringValue)) return fallback;
  const parsed = Number(stringValue);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) secured.headers.set(name, value);
  return secured;
}

function isFeedCache(candidate: unknown): candidate is FeedCache {
  return (
    candidate !== null &&
    typeof candidate === "object" &&
    "match" in candidate &&
    typeof candidate.match === "function" &&
    "put" in candidate &&
    typeof candidate.put === "function"
  );
}

function runtimeDefaultCache(): FeedCache | undefined {
  if (typeof caches === "undefined" || !("default" in caches)) return undefined;
  const candidate: unknown = Reflect.get(caches, "default");
  return isFeedCache(candidate) ? candidate : undefined;
}

export function createWorkerHandler(
  env: Env,
  config: WorkerConfig = {
    cacheTtlSeconds: configuredPositiveInteger(env.FEED_CACHE_TTL_SECONDS, 300),
    maxResponseBytes: configuredPositiveInteger(env.FEED_MAX_RESPONSE_BYTES, 1_000_000),
  },
  context?: ExecutionContext,
) {
  const handleFeed = createFeedHandler({
    fetchUpstream: fetch,
    cache: runtimeDefaultCache(),
    cacheTtlSeconds: configuredPositiveInteger(config.cacheTtlSeconds, 300),
    maxBodyBytes: configuredPositiveInteger(config.maxResponseBytes, 1_000_000),
    rateLimit: async (request) => {
      const key = request.headers.get("CF-Connecting-IP") ?? "anonymous";
      return (await env.FEED_RATE_LIMITER.limit({ key })).success;
    },
    defer: context ? (promise) => context.waitUntil(promise) : undefined,
  });
  return async (request: Request): Promise<Response> => {
    const response =
      new URL(request.url).pathname === "/api/feed"
        ? await handleFeed(request)
        : await env.ASSETS.fetch(request);
    return withSecurityHeaders(response);
  };
}
