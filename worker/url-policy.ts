import { FeedError } from "./errors";

const PRIVATE_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home", ".lan"];

function isIpv4(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function isIpLiteral(hostname: string): boolean {
  return isIpv4(hostname) || hostname.includes(":");
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    host === "localhost" ||
    !host.includes(".") ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

export function validateFetchUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new FeedError("invalid_url", "Enter a valid absolute HTTPS URL.", 400);
  }

  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new FeedError(
      "invalid_url",
      "Feed addresses must use HTTPS without credentials or a nonstandard port.",
      400,
    );
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIpLiteral(hostname) || isPrivateHostname(hostname)) {
    throw new FeedError(
      "blocked_destination",
      "That destination is not publicly addressable.",
      400,
    );
  }

  url.hash = "";
  return url;
}

export function normalizeHttpsUrl(input: unknown, base: URL): string | undefined {
  if (typeof input !== "string" || input.trim() === "") return undefined;
  try {
    const url = new URL(input.trim(), base);
    return validateFetchUrl(url.href).href;
  } catch {
    return undefined;
  }
}
