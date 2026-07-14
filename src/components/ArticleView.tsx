import { Check, RotateCcw, Star } from "lucide-react";
import type { Article, Feed } from "../domain/types";
import { ArticleContent } from "./ArticleContent";
import { htmlSummaryToText } from "./html-summary";
import { ViewTransitionLink } from "./ViewTransitionLink";

interface ArticleViewProps {
  article?: Article;
  feed?: Feed;
  onSetRead: (article: Article, read: boolean) => Promise<void>;
  onSetStarred: (article: Article, starred: boolean) => Promise<void>;
}

function safeHttpsUrl(value?: string): string | null {
  if (value === undefined) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === ""
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function ArticleView({ article, feed, onSetRead, onSetStarred }: ArticleViewProps) {
  if (article === undefined) {
    return (
      <div className="empty-state">
        <h1>Article not found</h1>
        <p>This article may have been removed from local storage.</p>
        <ViewTransitionLink to="/all">Return to all articles</ViewTransitionLink>
      </div>
    );
  }

  const publisherUrl = safeHttpsUrl(article.url) ?? safeHttpsUrl(feed?.siteUrl);
  return (
    <article className="article-view" aria-labelledby="article-title">
      <ViewTransitionLink className="back-link" to="/all">
        Back to articles
      </ViewTransitionLink>
      <header>
        <p className="eyebrow">{feed?.title ?? "Article"}</p>
        <h1 id="article-title">{article.title}</h1>
        {article.author === undefined ? null : <p>By {article.author}</p>}
      </header>
      <menu className="article-actions">
        <li>
          <button
            className="icon-button"
            type="button"
            title={`Mark as ${article.readAt === undefined ? "read" : "unread"}`}
            onClick={() => onSetRead(article, article.readAt === undefined)}
          >
            {article.readAt === undefined ? (
              <Check aria-hidden="true" />
            ) : (
              <RotateCcw aria-hidden="true" />
            )}
            <span className="visually-hidden">
              Mark as {article.readAt === undefined ? "read" : "unread"}
            </span>
          </button>
        </li>
        <li>
          <button
            className="icon-button"
            type="button"
            title={`${article.starred ? "Unstar" : "Star"} article`}
            onClick={() => onSetStarred(article, !article.starred)}
          >
            <Star fill={article.starred ? "currentColor" : "none"} aria-hidden="true" />
            <span className="visually-hidden">{article.starred ? "Unstar" : "Star"} article</span>
          </button>
        </li>
      </menu>
      {article.contentHtml === undefined ? (
        <p>
          {article.excerpt === undefined
            ? "No content is available."
            : htmlSummaryToText(article.excerpt)}
        </p>
      ) : (
        <ArticleContent html={article.contentHtml} />
      )}
      {publisherUrl === null ? null : (
        <p className="publisher-link">
          <a
            href={publisherUrl}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            Read on the publisher’s website
          </a>
        </p>
      )}
    </article>
  );
}
