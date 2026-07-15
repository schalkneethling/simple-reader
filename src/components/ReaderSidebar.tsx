import { CircleDot, Inbox, RefreshCw, RotateCcw, Rss, Star, Trash2 } from "lucide-react";
import type { Article, Feed } from "../domain/types";
import { ViewTransitionNavLink } from "./ViewTransitionLink";

interface ReaderSidebarProps {
  feeds: Feed[];
  articles: Article[];
  busyFeedId: string | null;
  onRefresh: (feedId?: string) => Promise<void>;
  onRemove: (feed: Feed) => Promise<void>;
}

function navClassName({ isActive }: { isActive: boolean }) {
  return isActive ? "nav-link nav-link-active" : "nav-link";
}

function countLabel(count: number): string {
  return `${count} ${count === 1 ? "article" : "articles"}`;
}

export function ReaderSidebar({
  feeds,
  articles,
  busyFeedId,
  onRefresh,
  onRemove,
}: ReaderSidebarProps) {
  const unreadCount = articles.filter((article) => article.readAt === undefined).length;
  const readCount = articles.length - unreadCount;
  return (
    <aside className="reader-sidebar">
      <div className="sidebar-overview">
        <nav id="reader-navigation" aria-label="Reader views">
          <p className="sidebar-heading-label">Reading list</p>
          <ul className="view-list">
            <li>
              <ViewTransitionNavLink to="/all" className={navClassName}>
                <Inbox aria-hidden="true" />
                <span>All articles</span>
              </ViewTransitionNavLink>
            </li>
            <li>
              <ViewTransitionNavLink
                to="/unread"
                className={navClassName}
                aria-label={`Unread, ${countLabel(unreadCount)}`}
              >
                <CircleDot aria-hidden="true" />
                <span>Unread</span>
                <span aria-hidden="true" className="nav-count">
                  {unreadCount}
                </span>
              </ViewTransitionNavLink>
            </li>
            <li>
              <ViewTransitionNavLink
                to="/read"
                className={navClassName}
                aria-label={`Read, ${countLabel(readCount)}`}
              >
                <RotateCcw aria-hidden="true" />
                <span>Read</span>
                <span aria-hidden="true" className="nav-count">
                  {readCount}
                </span>
              </ViewTransitionNavLink>
            </li>
            <li>
              <ViewTransitionNavLink to="/starred" className={navClassName}>
                <Star aria-hidden="true" />
                <span>Starred</span>
              </ViewTransitionNavLink>
            </li>
          </ul>
        </nav>
      </div>
      <section className="subscriptions" aria-labelledby="subscriptions-heading">
        <header className="sidebar-heading">
          <h2 id="subscriptions-heading" className="sidebar-heading-label">
            <Rss aria-hidden="true" />
            <span>Subscriptions</span>
          </h2>
        </header>
        {feeds.length === 0 ? (
          <p className="empty-note">No subscriptions yet.</p>
        ) : (
          <ul className="feed-list">
            {feeds.map((feed) => (
              <li key={feed.id} className="feed-item">
                <ViewTransitionNavLink
                  to={`/feeds/${encodeURIComponent(feed.id)}`}
                  className={navClassName}
                >
                  {feed.title}
                </ViewTransitionNavLink>
                <div className="feed-item-actions">
                  <button
                    className="icon-button"
                    type="button"
                    title={`Refresh ${feed.title}`}
                    onClick={() => onRefresh(feed.id)}
                    disabled={busyFeedId !== null}
                  >
                    <RefreshCw aria-hidden="true" />
                    <span className="visually-hidden">Refresh {feed.title}</span>
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    title={`Remove ${feed.title}`}
                    onClick={() => onRemove(feed)}
                    disabled={busyFeedId !== null}
                  >
                    <Trash2 aria-hidden="true" />
                    <span className="visually-hidden">Remove {feed.title}</span>
                  </button>
                </div>
                {feed.error === undefined ? null : (
                  <p className="message message-error">Last refresh failed: {feed.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
