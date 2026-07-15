import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useParams } from "react-router";
import type { Article, Feed } from "../domain/types";
import { AddFeedForm } from "../components/AddFeedForm";
import { ArticleList } from "../components/ArticleList";
import { ArticleView } from "../components/ArticleView";
import { ReaderSidebar } from "../components/ReaderSidebar";
import { ReaderTopbar } from "../components/ReaderTopbar";
import type { ReaderAppProps, SubscriptionResult } from "./contracts";
import { READER_ROUTES } from "./routes";

interface DynamicRouteProps {
  articles: Article[];
  feeds: Feed[];
  onSetRead: (article: Article, read: boolean) => Promise<void>;
  onSetStarred: (article: Article, starred: boolean) => Promise<void>;
}

function FeedRoute({ articles, feeds, onSetRead, onSetStarred }: DynamicRouteProps) {
  const { feedId } = useParams();
  const feed = feeds.find((item) => item.id === feedId);
  return (
    <ArticleList
      title={feed?.title ?? "Feed not found"}
      articles={articles.filter((article) => article.feedId === feedId)}
      feeds={feeds}
      onSetRead={onSetRead}
      onSetStarred={onSetStarred}
    />
  );
}

function ArticleRoute({ articles, feeds, onSetRead, onSetStarred }: DynamicRouteProps) {
  const { articleId } = useParams();
  const article = articles.find((item) => item.id === articleId);
  const feed = feeds.find((item) => item.id === article?.feedId);
  return (
    <ArticleView article={article} feed={feed} onSetRead={onSetRead} onSetStarred={onSetStarred} />
  );
}

export function ReaderApp({ service, initialFeeds = [], initialArticles = [] }: ReaderAppProps) {
  const [feeds, setFeeds] = useState(initialFeeds);
  const [articles, setArticles] = useState(initialArticles);
  const [busyFeedId, setBusyFeedId] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationStatus, setOperationStatus] = useState<string | null>(null);

  useEffect(() => {
    if (service.refreshStale === undefined) return undefined;
    let active = true;
    const refreshStale = async () => {
      try {
        const result = await service.refreshStale?.();
        if (active && result !== undefined) {
          setFeeds(result.feeds);
          setArticles(result.articles);
        }
      } catch {
        if (active) setOperationError("The refresh failed. Cached articles are still available.");
      }
    };
    const handleFocus = () => void refreshStale();
    void refreshStale();
    window.addEventListener("focus", handleFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", handleFocus);
    };
  }, [service]);

  const addSubscription = useCallback(
    async (url: string): Promise<SubscriptionResult> => {
      const result = await service.addFeed(url);
      if (result.status === "added") {
        setFeeds((current) => [
          ...current.filter((feed) => feed.id !== result.feed.id),
          result.feed,
        ]);
        setArticles((current) => [
          ...current.filter((article) => article.feedId !== result.feed.id),
          ...result.articles,
        ]);
      }
      return result;
    },
    [service],
  );

  const refresh = useCallback(
    async (feedId?: string) => {
      setBusyFeedId(feedId ?? "all");
      setOperationError(null);
      setOperationStatus(feedId === undefined ? "Refreshing feeds…" : "Refreshing feed…");
      try {
        const result =
          feedId === undefined ? await service.refresh() : await service.refresh(feedId);
        setFeeds(result.feeds);
        setArticles(result.articles);
      } catch {
        setOperationError("The refresh failed. Cached articles are still available.");
      } finally {
        setBusyFeedId(null);
        setOperationStatus(null);
      }
    },
    [service],
  );

  const removeFeed = useCallback(
    async (feed: Feed) => {
      setBusyFeedId(feed.id);
      setOperationError(null);
      setOperationStatus(`Removing ${feed.title}…`);
      try {
        await service.removeFeed(feed.id);
        setFeeds((current) => current.filter((item) => item.id !== feed.id));
        setArticles((current) => current.filter((article) => article.feedId !== feed.id));
      } catch {
        setOperationError(`Could not remove ${feed.title}.`);
      } finally {
        setBusyFeedId(null);
        setOperationStatus(null);
      }
    },
    [service],
  );

  const setRead = useCallback(
    async (article: Article, read: boolean) => {
      setOperationError(null);
      try {
        await service.setRead(article.id, read);
        setArticles((current) =>
          current.map((item) =>
            item.id === article.id
              ? { ...item, readAt: read ? new Date().toISOString() : undefined }
              : item,
          ),
        );
      } catch {
        setOperationError("Could not update the article. Its cached state is unchanged.");
      }
    },
    [service],
  );

  const setStarred = useCallback(
    async (article: Article, starred: boolean) => {
      setOperationError(null);
      try {
        await service.setStarred(article.id, starred);
        setArticles((current) =>
          current.map((item) => (item.id === article.id ? { ...item, starred } : item)),
        );
      } catch {
        setOperationError("Could not update the article. Its cached state is unchanged.");
      }
    },
    [service],
  );

  const deleteArticle = useCallback(
    async (article: Article) => {
      setOperationError(null);
      try {
        await service.deleteArticle(article.id);
        setArticles((current) => current.filter((item) => item.id !== article.id));
      } catch {
        setOperationError(`Could not delete ${article.title}.`);
      }
    },
    [service],
  );

  const purgeReadArticles = useCallback(async () => {
    const readCount = articles.filter((article) => article.readAt !== undefined).length;
    if (
      !window.confirm(
        `Permanently delete ${readCount} read ${readCount === 1 ? "article" : "articles"}? This cannot be undone.`,
      )
    )
      return;
    setOperationError(null);
    try {
      await service.purgeReadArticles();
      setArticles((current) => current.filter((article) => article.readAt === undefined));
    } catch {
      setOperationError("Could not delete the read articles.");
    }
  }, [articles, service]);

  const routeProps = { articles, feeds, onSetRead: setRead, onSetStarred: setStarred };

  return (
    <div className="reader-app">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <a className="skip-link" href="#reader-navigation">
        Skip to reader views
      </a>
      <ReaderTopbar busy={busyFeedId !== null} onRefresh={() => void refresh()} />
      <div className="reader-shell">
        <ReaderSidebar
          feeds={feeds}
          articles={articles}
          busyFeedId={busyFeedId}
          onRefresh={refresh}
          onRemove={removeFeed}
        />
        <main id="main-content" className="reader-main" tabIndex={-1}>
          <section className="subscription-composer" aria-label="Add a subscription">
            <AddFeedForm onSubscribe={addSubscription} />
          </section>
          <div className="reader-content">
            {operationStatus === null ? null : (
              <p className="visually-hidden" role="status">
                {operationStatus}
              </p>
            )}
            {operationError === null ? null : (
              <p className="message message-error" role="alert">
                {operationError}
              </p>
            )}
            <Routes>
              <Route path="/" element={<Navigate to={READER_ROUTES.unread} replace />} />
              <Route
                path={READER_ROUTES.all}
                element={<ArticleList title="All articles" {...routeProps} />}
              />
              <Route
                path={READER_ROUTES.unread}
                element={
                  <ArticleList
                    title="Unread"
                    {...routeProps}
                    articles={articles.filter((article) => article.readAt === undefined)}
                    emptyMessage="No unread articles."
                  />
                }
              />
              <Route
                path={READER_ROUTES.read}
                element={
                  <>
                    {articles.some((article) => article.readAt !== undefined) ? (
                      <button
                        className="danger-action"
                        type="button"
                        onClick={() => void purgeReadArticles()}
                      >
                        Permanently delete all{" "}
                        {articles.filter((article) => article.readAt !== undefined).length} read{" "}
                        {articles.filter((article) => article.readAt !== undefined).length === 1
                          ? "article"
                          : "articles"}
                      </button>
                    ) : null}
                    <ArticleList
                      title="Read"
                      {...routeProps}
                      articles={articles.filter((article) => article.readAt !== undefined)}
                      onDeleteArticle={deleteArticle}
                      readView
                      emptyMessage="No read articles."
                    />
                  </>
                }
              />
              <Route
                path={READER_ROUTES.starred}
                element={
                  <ArticleList
                    title="Starred"
                    {...routeProps}
                    articles={articles.filter((article) => article.starred)}
                  />
                }
              />
              <Route path={READER_ROUTES.feed} element={<FeedRoute {...routeProps} />} />
              <Route path={READER_ROUTES.article} element={<ArticleRoute {...routeProps} />} />
              <Route path="*" element={<Navigate to={READER_ROUTES.unread} replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}
