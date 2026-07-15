import type { FeedApiResponse } from "../src/domain/types";
import { discoverFeeds } from "./discovery";
import { FeedError, type SafeErrorDiagnostic } from "./errors";
import { parseFeed } from "./parser";
import { fetchDocument } from "./upstream";
import { validateFetchUrl } from "./url-policy";

export interface FeedCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface FeedHandlerDependencies {
  fetchUpstream: typeof fetch;
  maxBodyBytes?: number;
  rateLimit?: (request: Request) => Promise<boolean>;
  cache?: FeedCache;
  maxRedirects?: number;
  timeoutMs?: number;
  cacheTtlSeconds?: number;
  defer?: (promise: Promise<void>) => void;
  reportError?: (error: FeedError, diagnostic: SafeErrorDiagnostic) => void;
}

function json(body: FeedApiResponse, status = 200, cacheTtlSeconds = 300): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": status === 200 ? `public, max-age=${cacheTtlSeconds}` : "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function errorResponse(error: FeedError): Response {
  return json({ status: "error", code: error.code, message: error.message }, error.httpStatus);
}

export function createFeedHandler(dependencies: FeedHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const requestUrl = new URL(request.url);
    if (request.method !== "GET" || requestUrl.pathname !== "/api/feed") {
      return json({ status: "error", code: "not_found", message: "Route not found." }, 404);
    }

    const input = requestUrl.searchParams.get("url");
    if (!input)
      return errorResponse(new FeedError("missing_url", "A feed or website URL is required.", 400));

    try {
      const target = validateFetchUrl(input);
      if (target.origin === requestUrl.origin) {
        throw new FeedError("blocked_destination", "The feed endpoint cannot fetch itself.", 400);
      }
      if (dependencies.rateLimit && !(await dependencies.rateLimit(request))) {
        return errorResponse(
          new FeedError("rate_limited", "Too many feed requests. Try again later.", 429),
        );
      }

      const cacheKey = new Request(requestUrl.href, { method: "GET" });
      const cached = await dependencies.cache?.match(cacheKey);
      if (cached) return cached;

      const document = await fetchDocument(target, {
        fetchUpstream: dependencies.fetchUpstream,
        maxBodyBytes: dependencies.maxBodyBytes ?? 1_000_000,
        maxRedirects: dependencies.maxRedirects ?? 5,
        timeoutMs: dependencies.timeoutMs ?? 10_000,
      });

      let response: Response;
      if (document.contentType.includes("html")) {
        const choices = discoverFeeds(document.body, document.finalUrl);
        response = choices.length
          ? json({ status: "choices", choices }, 200, dependencies.cacheTtlSeconds)
          : errorResponse(
              new FeedError("feed_not_found", "No RSS or Atom feed was found on that page.", 404),
            );
      } else if (
        document.contentType.includes("xml") ||
        /^\s*(?:<\?xml[^>]*>\s*)?<(?:rss|feed)\b/i.test(document.body)
      ) {
        const parsed = parseFeed(document.body, document.finalUrl);
        response = json(
          { status: "ready", ...parsed, fetchedAt: new Date().toISOString() },
          200,
          dependencies.cacheTtlSeconds,
        );
      } else {
        response = errorResponse(
          new FeedError("unsupported_content", "The upstream is not a feed or HTML page.", 415),
        );
      }

      if (response.ok && dependencies.cache) {
        const write = dependencies.cache.put(cacheKey, response.clone());
        if (dependencies.defer) dependencies.defer(write);
        else await write;
      }
      return response;
    } catch (error) {
      if (error instanceof FeedError) {
        if (error.diagnostic) {
          try {
            if (dependencies.reportError) dependencies.reportError(error, error.diagnostic);
            else console.error(JSON.stringify(error.diagnostic));
          } catch {
            console.error(JSON.stringify({ ...error.diagnostic, reporterStatus: "failed" }));
          }
        }
        return errorResponse(error);
      }
      console.error(JSON.stringify({ message: "feed request failed", error: "unexpected_error" }));
      return errorResponse(
        new FeedError("internal_error", "The feed request failed unexpectedly.", 500),
      );
    }
  };
}
