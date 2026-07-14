export type FeedId = string;
export type ArticleId = string;

export interface Feed {
  id: FeedId;
  url: string;
  siteUrl?: string;
  title: string;
  description?: string;
  addedAt: string;
  refreshedAt?: string;
  error?: string;
}

export interface Article {
  id: ArticleId;
  feedId: FeedId;
  guid?: string;
  url: string;
  title: string;
  author?: string;
  publishedAt?: string;
  excerpt?: string;
  contentHtml?: string;
  readAt?: string;
  starred: boolean;
}

export interface NormalizedFeed {
  url: string;
  siteUrl?: string;
  title: string;
  description?: string;
}

export interface NormalizedArticle {
  guid?: string;
  url: string;
  title: string;
  author?: string;
  publishedAt?: string;
  excerpt?: string;
  contentHtml?: string;
}

export interface FeedChoice {
  url: string;
  title: string;
}

export type FeedApiResponse =
  | { status: "ready"; feed: NormalizedFeed; articles: NormalizedArticle[]; fetchedAt: string }
  | { status: "choices"; choices: FeedChoice[] }
  | { status: "error"; code: string; message: string };
