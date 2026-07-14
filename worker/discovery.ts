import type { FeedChoice } from "../src/domain/types";
import { normalizeHttpsUrl } from "./url-policy";

function decodeHtml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function attributes(tag: string): Map<string, string> {
  const result = new Map<string, string>();
  const pattern = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of tag.matchAll(pattern)) {
    result.set(match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? ""));
  }
  return result;
}

export function discoverFeeds(html: string, pageUrl: URL): FeedChoice[] {
  const choices = new Map<string, FeedChoice>();
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const rel = attrs.get("rel")?.toLowerCase().split(/\s+/) ?? [];
    const type = attrs.get("type")?.toLowerCase();
    if (
      !rel.includes("alternate") ||
      !type ||
      !["application/rss+xml", "application/atom+xml"].includes(type)
    ) {
      continue;
    }
    const url = normalizeHttpsUrl(attrs.get("href"), pageUrl);
    if (!url) continue;
    choices.set(url, { url, title: attrs.get("title")?.trim() || new URL(url).hostname });
  }
  return [...choices.values()];
}
