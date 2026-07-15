import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Article, Feed } from "../domain/types";
import { ReaderApp } from "./ReaderApp";
import type { ReaderService } from "./contracts";

const feed: Feed = {
  id: "feed-1",
  url: "https://example.com/feed.xml",
  siteUrl: "https://example.com",
  title: "Example Journal",
  addedAt: "2026-07-14T08:00:00.000Z",
};

const articles: Article[] = [
  {
    id: "article-1",
    feedId: feed.id,
    url: "https://example.com/first",
    title: "A first story",
    excerpt: "A useful summary.",
    publishedAt: "2026-07-14T07:00:00.000Z",
    starred: false,
  },
  {
    id: "article-2",
    feedId: feed.id,
    url: "https://example.com/read",
    title: "Already read",
    readAt: "2026-07-14T09:00:00.000Z",
    starred: true,
  },
];

function makeService(): ReaderService {
  return {
    addFeed: vi.fn().mockResolvedValue({ status: "error", message: "Feed not found" }),
    refresh: vi.fn().mockResolvedValue({ feeds: [feed], articles }),
    removeFeed: vi.fn().mockResolvedValue(undefined),
    setRead: vi.fn().mockResolvedValue(undefined),
    setStarred: vi.fn().mockResolvedValue(undefined),
    deleteArticle: vi.fn().mockResolvedValue(undefined),
    purgeReadArticles: vi.fn().mockResolvedValue(undefined),
  } as ReaderService;
}

function renderReader(path = "/all", service = makeService(), initialArticles = articles) {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <ReaderApp service={service} initialFeeds={[feed]} initialArticles={initialArticles} />
    </MemoryRouter>,
  );
  return { service, ...view };
}

describe("ReaderApp", () => {
  it("uses Unread for the root and unknown routes", () => {
    const { unmount } = renderReader("/");
    expect(screen.getByRole("heading", { level: 1, name: "Unread" })).toBeInTheDocument();
    unmount();

    renderReader("/does-not-exist");
    expect(screen.getByRole("heading", { level: 1, name: "Unread" })).toBeInTheDocument();
  });

  it("shows synchronized view counts and a dedicated Read view", async () => {
    const user = userEvent.setup();
    renderReader("/unread");

    expect(screen.getByRole("link", { name: "Unread, 1 article" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read, 1 article" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark A first story as read" }));

    expect(screen.getByRole("heading", { level: 1, name: "Unread" })).toBeInTheDocument();
    expect(screen.getByText("No unread articles.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Unread, 0 articles" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read, 2 articles" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Read, 2 articles" }));
    expect(screen.getByRole("heading", { level: 1, name: "Read" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("restores and permanently deletes individual read articles", async () => {
    const user = userEvent.setup();
    const { service } = renderReader("/read");
    const readArticle = screen.getByRole("article", { name: "Already read" });

    await user.click(within(readArticle).getByRole("button", { name: "Restore Already read" }));
    expect(service.setRead).toHaveBeenCalledWith("article-2", false);
    expect(screen.queryByRole("article", { name: "Already read" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Unread, 2 articles" }));
    const firstArticle = screen.getByRole("article", { name: "A first story" });
    await user.click(
      within(firstArticle).getByRole("button", { name: "Mark A first story as read" }),
    );
    await user.click(screen.getByRole("link", { name: "Read, 1 article" }));
    await user.click(
      within(screen.getByRole("article", { name: "A first story" })).getByRole("button", {
        name: "Permanently delete A first story",
      }),
    );

    expect(service.deleteArticle).toHaveBeenCalledWith("article-1");
    expect(screen.queryByRole("article", { name: "A first story" })).not.toBeInTheDocument();
  });

  it("purges all read articles only after confirmation", async () => {
    const user = userEvent.setup();
    const service = makeService();
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirm);
    renderReader("/read", service);

    const purge = screen.getByRole("button", { name: "Permanently delete all 1 read article" });
    await user.click(purge);
    expect(service.purgeReadArticles).not.toHaveBeenCalled();
    expect(screen.getByRole("article", { name: "Already read" })).toBeInTheDocument();

    await user.click(purge);
    expect(service.purgeReadArticles).toHaveBeenCalledOnce();
    expect(screen.getByText("No read articles.")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
  it("presents labelled navigation, one main heading, and the article list", () => {
    renderReader();

    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("navigation", { name: "Reader views" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("heading", { level: 1, name: "All articles" }),
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("keeps subscription creation in the main workspace", () => {
    renderReader();

    const main = screen.getByRole("main");
    const sidebar = screen.getByRole("complementary");
    const addSubscription = screen.getByRole("form", { name: "Add a subscription" });

    expect(main).toContainElement(addSubscription);
    expect(sidebar).not.toContainElement(addSubscription);
  });

  it("puts the reader brand and global refresh action in a top bar", () => {
    renderReader();

    const topBar = screen.getByRole("banner", { name: "Reader toolbar" });
    const sidebar = screen.getByRole("complementary");
    const refreshAll = screen.getByRole("button", { name: "Refresh all feeds" });

    expect(topBar).toContainElement(screen.getByRole("link", { name: "Simple Reader" }));
    expect(topBar).toContainElement(refreshAll);
    expect(sidebar).not.toContainElement(refreshAll);
  });

  it("uses a native view transition for reader-view navigation when available", async () => {
    const user = userEvent.setup();
    const original = Object.getOwnPropertyDescriptor(document, "startViewTransition");
    const startViewTransition = vi.fn((update: () => void) => update());
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    });

    try {
      renderReader();

      await user.click(screen.getByRole("link", { name: "Unread, 1 article" }));

      expect(startViewTransition).toHaveBeenCalledOnce();
      expect(screen.getByRole("heading", { level: 1, name: "Unread" })).toBeInTheDocument();
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(document, "startViewTransition");
      } else {
        Object.defineProperty(document, "startViewTransition", original);
      }
    }
  });

  it("routes unread, starred, feed, and article views by user-visible links", () => {
    const { unmount } = renderReader("/unread");
    expect(screen.getByRole("heading", { level: 1, name: "Unread" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "A first story" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Already read" })).not.toBeInTheDocument();
    unmount();

    renderReader("/starred");
    expect(screen.getByRole("heading", { level: 1, name: "Starred" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Already read" })).toBeInTheDocument();
  });

  it("shows HTML summaries as decoded plain text", () => {
    const articleWithHtmlSummary: Article = {
      id: "article-html-summary",
      feedId: feed.id,
      url: "https://example.com/html-summary",
      title: "Markup summary",
      excerpt: "<p>A <em>useful</em> summary &amp; details.</p>",
      starred: false,
    };
    const articleWithEscapedHtmlSummary: Article = {
      id: "article-escaped-html-summary",
      feedId: feed.id,
      url: "https://example.com/escaped-html-summary",
      title: "Escaped markup summary",
      excerpt: "&lt;p&gt;Another &lt;em&gt;useful&lt;/em&gt; summary &amp;amp; details.&lt;/p&gt;",
      starred: false,
    };

    const { unmount } = renderReader("/all", makeService(), [
      articleWithHtmlSummary,
      articleWithEscapedHtmlSummary,
    ]);

    expect(screen.getByText("A useful summary & details.")).toBeInTheDocument();
    expect(screen.getByText("Another useful summary & details.")).toBeInTheDocument();
    expect(screen.queryByText(/<p>|<\/em>|&(?:amp|lt);/)).not.toBeInTheDocument();
    unmount();

    renderReader("/articles/article-html-summary", makeService(), [articleWithHtmlSummary]);

    expect(screen.getByText("A useful summary & details.")).toBeInTheDocument();
    expect(screen.queryByText(/<p>|<\/em>|&amp;/)).not.toBeInTheDocument();
  });

  it("rejects a non-HTTPS subscription before calling the service", async () => {
    const user = userEvent.setup();
    const { service } = renderReader();

    await user.type(screen.getByLabelText("Feed or website URL"), "http://example.com/feed");
    await user.click(screen.getByRole("button", { name: "Add feed" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid HTTPS URL");
    expect(service.addFeed).not.toHaveBeenCalled();
  });

  it("exposes refresh, remove, read, and star actions with item context", async () => {
    const user = userEvent.setup();
    const { service } = renderReader();
    const firstArticle = screen.getByRole("article", { name: "A first story" });
    const iconButtons = document.querySelectorAll<HTMLButtonElement>(".icon-button");

    expect(iconButtons).not.toHaveLength(0);
    for (const button of iconButtons) {
      expect(button.querySelector(".visually-hidden")).not.toBeNull();
    }

    await user.click(screen.getByRole("button", { name: "Refresh all feeds" }));
    await user.click(screen.getByRole("button", { name: "Refresh Example Journal" }));
    await user.click(
      within(firstArticle).getByRole("button", { name: "Mark A first story as read" }),
    );
    await user.click(within(firstArticle).getByRole("button", { name: "Star A first story" }));

    expect(service.refresh).toHaveBeenNthCalledWith(1);
    expect(service.refresh).toHaveBeenNthCalledWith(2, feed.id);
    expect(service.setRead).toHaveBeenCalledWith("article-1", true);
    expect(service.setStarred).toHaveBeenCalledWith("article-1", true);
  });

  it("refreshes stale feeds on startup and when the window regains focus", async () => {
    const service = makeService();
    service.refreshStale = vi.fn().mockResolvedValue({ feeds: [feed], articles });
    renderReader("/all", service);

    await waitFor(() => expect(service.refreshStale).toHaveBeenCalledTimes(1));
    fireEvent.focus(window);
    await waitFor(() => expect(service.refreshStale).toHaveBeenCalledTimes(2));
  });

  it("announces a failed article-state update without changing cached state", async () => {
    const user = userEvent.setup();
    const service = makeService();
    service.setRead = vi.fn().mockRejectedValue(new Error("storage unavailable"));
    renderReader("/all", service);

    await user.click(
      within(screen.getByRole("article", { name: "A first story" })).getByRole("button", {
        name: "Mark A first story as read",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not update the article");
    expect(screen.getByRole("button", { name: "Mark A first story as read" })).toBeInTheDocument();
  });

  it("announces refresh progress while cached articles remain available", async () => {
    const user = userEvent.setup();
    const service = makeService();
    let finishRefresh: ((value: { feeds: Feed[]; articles: Article[] }) => void) | undefined;
    service.refresh = vi.fn(
      async () =>
        new Promise<{ feeds: Feed[]; articles: Article[] }>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    renderReader("/all", service);

    await user.click(screen.getByRole("button", { name: "Refresh all feeds" }));
    expect(screen.getByRole("status")).toHaveTextContent("Refreshing feeds");
    expect(screen.getByRole("article", { name: "A first story" })).toBeInTheDocument();

    finishRefresh?.({ feeds: [feed], articles });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });
});
