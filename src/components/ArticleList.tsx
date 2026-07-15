import { Check, RotateCcw, Star, Trash2 } from "lucide-react";
import type { Article, Feed } from "../domain/types";
import { htmlSummaryToText } from "./html-summary";
import { ViewTransitionLink } from "./ViewTransitionLink";

interface ArticleListProps {
  title: string;
  articles: Article[];
  feeds: Feed[];
  onSetRead: (article: Article, read: boolean) => Promise<void>;
  onSetStarred: (article: Article, starred: boolean) => Promise<void>;
  onDeleteArticle?: (article: Article) => Promise<void>;
  readView?: boolean;
  emptyMessage?: string;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function displayDate(value?: string): string | null {
  if (value === undefined) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dateFormatter.format(date);
}

export function ArticleList({
  title,
  articles,
  feeds,
  onSetRead,
  onSetStarred,
  onDeleteArticle,
  readView = false,
  emptyMessage = "Nothing to read here yet.",
}: ArticleListProps) {
  const feedNames = new Map(feeds.map((feed) => [feed.id, feed.title]));

  return (
    <>
      <header className="view-header">
        <p className="eyebrow">Reading list</p>
        <h1>{title}</h1>
        <p>
          {articles.length} {articles.length === 1 ? "article" : "articles"}
        </p>
      </header>
      {articles.length === 0 ? (
        <div className="empty-state">
          <p>{emptyMessage}</p>
          <p>Refresh your subscriptions or choose another view.</p>
        </div>
      ) : (
        <ol className="article-list">
          {articles.map((article) => {
            const headingId = `article-${article.id}-title`;
            const date = displayDate(article.publishedAt);
            const readActionLabel = readView
              ? `Restore ${article.title}`
              : `Mark ${article.title} as ${article.readAt === undefined ? "read" : "unread"}`;
            return (
              <li key={article.id}>
                <article
                  className={
                    article.readAt === undefined ? "article-card" : "article-card article-card-read"
                  }
                  aria-labelledby={headingId}
                >
                  <div className="article-card-meta">
                    <span>{feedNames.get(article.feedId) ?? "Unknown feed"}</span>
                    {date === null ? null : <time dateTime={article.publishedAt}>{date}</time>}
                  </div>
                  <h2 id={headingId}>
                    <ViewTransitionLink to={`/articles/${encodeURIComponent(article.id)}`}>
                      {article.title}
                    </ViewTransitionLink>
                  </h2>
                  {article.excerpt === undefined ? null : (
                    <p>{htmlSummaryToText(article.excerpt)}</p>
                  )}
                  <menu className="article-actions">
                    <li>
                      <button
                        className="icon-button"
                        type="button"
                        title={readActionLabel}
                        onClick={() => onSetRead(article, article.readAt === undefined)}
                      >
                        {article.readAt === undefined ? (
                          <Check aria-hidden="true" />
                        ) : (
                          <RotateCcw aria-hidden="true" />
                        )}
                        <span className="visually-hidden">{readActionLabel}</span>
                      </button>
                    </li>
                    {readView && onDeleteArticle !== undefined ? (
                      <li>
                        <button
                          className="icon-button icon-button-danger"
                          type="button"
                          title={`Permanently delete ${article.title}`}
                          onClick={() => onDeleteArticle(article)}
                        >
                          <Trash2 aria-hidden="true" />
                          <span className="visually-hidden">
                            Permanently delete {article.title}
                          </span>
                        </button>
                      </li>
                    ) : null}
                    <li>
                      <button
                        className="icon-button"
                        type="button"
                        title={`${article.starred ? "Unstar" : "Star"} ${article.title}`}
                        onClick={() => onSetStarred(article, !article.starred)}
                      >
                        {article.starred ? (
                          <Star fill="currentColor" aria-hidden="true" />
                        ) : (
                          <Star aria-hidden="true" />
                        )}
                        <span className="visually-hidden">
                          {article.starred ? "Unstar" : "Star"} {article.title}
                        </span>
                      </button>
                    </li>
                  </menu>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
