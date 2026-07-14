import { XMLParser, XMLValidator } from "fast-xml-parser";

import type { NormalizedArticle, NormalizedFeed } from "../src/domain/types";
import { FeedError } from "./errors";
import { normalizeHttpsUrl } from "./url-policy";

interface ParsedFeed {
  feed: NormalizedFeed;
  articles: NormalizedArticle[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
});

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function list(value: unknown): unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number")
    return String(value).trim() || undefined;
  const object = record(value);
  return object ? text(object["#text"]) : undefined;
}

function date(value: unknown): string | undefined {
  const input = text(value);
  if (!input) return undefined;
  const parsed = new Date(input);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString();
}

function rss(root: Record<string, unknown>, sourceUrl: URL): ParsedFeed | undefined {
  const channel = record(record(root.rss)?.channel);
  if (!channel) return undefined;
  const siteUrl = normalizeHttpsUrl(text(channel.link), sourceUrl);
  const articles = list(channel.item).flatMap((raw): NormalizedArticle[] => {
    const item = record(raw);
    if (!item) return [];
    const url = normalizeHttpsUrl(text(item.link), sourceUrl);
    if (!url) return [];
    return [
      {
        guid: text(item.guid),
        url,
        title: text(item.title) ?? "Untitled article",
        author: text(item.author) ?? text(item["dc:creator"]),
        publishedAt: date(item.pubDate),
        excerpt: text(item.description),
        contentHtml: text(item["content:encoded"]),
      },
    ];
  });
  return {
    feed: {
      url: sourceUrl.href,
      ...(siteUrl ? { siteUrl } : {}),
      title: text(channel.title) ?? sourceUrl.hostname,
      ...(text(channel.description) ? { description: text(channel.description) } : {}),
    },
    articles,
  };
}

function atomLink(value: unknown, sourceUrl: URL, wantedRel: string): string | undefined {
  for (const raw of list(value)) {
    const link = record(raw);
    if (!link) continue;
    const rel = text(link["@_rel"]) ?? "alternate";
    if (rel !== wantedRel) continue;
    const href = normalizeHttpsUrl(text(link["@_href"]), sourceUrl);
    if (href) return href;
  }
  return undefined;
}

function atom(root: Record<string, unknown>, sourceUrl: URL): ParsedFeed | undefined {
  const feed = record(root.feed);
  if (!feed) return undefined;
  const siteUrl = atomLink(feed.link, sourceUrl, "alternate");
  const articles = list(feed.entry).flatMap((raw): NormalizedArticle[] => {
    const entry = record(raw);
    if (!entry) return [];
    const url = atomLink(entry.link, sourceUrl, "alternate");
    if (!url) return [];
    return [
      {
        guid: text(entry.id),
        url,
        title: text(entry.title) ?? "Untitled article",
        author: text(record(entry.author)?.name),
        publishedAt: date(entry.published) ?? date(entry.updated),
        excerpt: text(entry.summary),
        contentHtml: text(entry.content),
      },
    ];
  });
  return {
    feed: {
      url: sourceUrl.href,
      ...(siteUrl ? { siteUrl } : {}),
      title: text(feed.title) ?? sourceUrl.hostname,
      ...(text(feed.subtitle) ? { description: text(feed.subtitle) } : {}),
    },
    articles,
  };
}

export function parseFeed(xml: string, sourceUrl: URL): ParsedFeed {
  if (/<!DOCTYPE/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new FeedError("invalid_feed", "The upstream document is not valid feed XML.", 422);
  }
  const root = record(parser.parse(xml));
  const parsed = root && (rss(root, sourceUrl) ?? atom(root, sourceUrl));
  if (!parsed) throw new FeedError("unsupported_feed", "The XML document is not RSS or Atom.", 415);
  return parsed;
}
