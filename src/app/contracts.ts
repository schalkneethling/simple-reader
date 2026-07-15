import type { Article, Feed, FeedChoice } from "../domain/types";

export type SubscriptionResult =
  | { status: "added"; feed: Feed; articles: Article[] }
  | { status: "choices"; choices: FeedChoice[] }
  | { status: "error"; message: string };

export interface RefreshResult {
  feeds: Feed[];
  articles: Article[];
}

export interface ReaderService {
  addFeed: (url: string) => Promise<SubscriptionResult>;
  refresh: (feedId?: string) => Promise<RefreshResult>;
  refreshStale?: (now?: Date) => Promise<RefreshResult>;
  removeFeed: (feedId: string) => Promise<void>;
  setRead: (articleId: string, read: boolean) => Promise<void>;
  setStarred: (articleId: string, starred: boolean) => Promise<void>;
  deleteArticle: (articleId: string) => Promise<void>;
  purgeReadArticles: () => Promise<void>;
}

export interface ReaderAppProps {
  service: ReaderService;
  initialFeeds?: Feed[];
  initialArticles?: Article[];
}
