export const READER_ROUTES = {
  all: "/all",
  unread: "/unread",
  read: "/read",
  starred: "/starred",
  feed: "/feeds/:feedId",
  article: "/articles/:articleId",
} as const;
