import { FeedError, type SafeErrorDiagnostic } from "./errors";
import { validateFetchUrl } from "./url-policy";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface FetchUpstreamOptions {
  fetchUpstream: typeof fetch;
  maxBodyBytes: number;
  maxRedirects: number;
  timeoutMs: number;
}

export interface UpstreamDocument {
  body: string;
  contentType: string;
  finalUrl: URL;
}

function safeErrorName(error: unknown): SafeErrorDiagnostic["errorName"] {
  if (!(error instanceof Error)) return "Error";
  if (["AbortError", "TimeoutError", "TypeError"].includes(error.name)) {
    return error.name as SafeErrorDiagnostic["errorName"];
  }
  return "Error";
}

function safeCauseCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || typeof error.cause !== "object" || error.cause === null) {
    return undefined;
  }
  const code = Reflect.get(error.cause, "code");
  return typeof code === "string" && /^[A-Z0-9_]{1,64}$/.test(code) ? code : undefined;
}

function fetchDiagnostic(error: unknown, timedOut: boolean): SafeErrorDiagnostic {
  const causeCode = safeCauseCode(error);
  return {
    level: "error",
    event: "upstream_fetch_failed",
    category: timedOut
      ? "timeout"
      : error instanceof TypeError || causeCode
        ? "network"
        : "runtime",
    errorName: safeErrorName(error),
    ...(causeCode ? { causeCode } : {}),
  };
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > maxBytes) {
    throw new FeedError("response_too_large", "The upstream response is too large.", 413);
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel("Response exceeds configured limit");
        throw new FeedError("response_too_large", "The upstream response is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function fetchDocument(
  initialUrl: URL,
  options: FetchUpstreamOptions,
): Promise<UpstreamDocument> {
  let currentUrl = initialUrl;
  const fetchUpstream = options.fetchUpstream;

  for (let redirectCount = 0; redirectCount <= options.maxRedirects; redirectCount += 1) {
    let response: Response;
    try {
      response = await fetchUpstream(currentUrl, {
        redirect: "manual",
        headers: {
          accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8",
        },
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      throw new FeedError(
        timedOut ? "upstream_timeout" : "upstream_unavailable",
        timedOut ? "The upstream request timed out." : "The upstream feed could not be reached.",
        timedOut ? 504 : 502,
        { cause: error, diagnostic: fetchDiagnostic(error, timedOut) },
      );
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      if (redirectCount === options.maxRedirects) {
        throw new FeedError("too_many_redirects", "The upstream returned too many redirects.", 502);
      }
      const location = response.headers.get("location");
      if (!location)
        throw new FeedError("invalid_redirect", "The upstream redirect is invalid.", 502);
      try {
        currentUrl = validateFetchUrl(new URL(location, currentUrl).href);
      } catch {
        throw new FeedError(
          "unsafe_redirect",
          "The upstream redirected to an unsafe destination.",
          400,
        );
      }
      continue;
    }

    if (!response.ok) {
      throw new FeedError("upstream_error", "The upstream returned an unsuccessful response.", 502);
    }

    return {
      body: await readBoundedBody(response, options.maxBodyBytes),
      contentType: response.headers.get("content-type")?.toLowerCase() ?? "",
      finalUrl: currentUrl,
    };
  }

  throw new FeedError("too_many_redirects", "The upstream returned too many redirects.", 502);
}
