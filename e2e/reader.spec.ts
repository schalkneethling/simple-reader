import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const apiResponse = {
  status: "ready",
  feed: {
    url: "https://news.example/feed.xml",
    siteUrl: "https://news.example/",
    title: "Example News",
  },
  articles: [
    {
      guid: "first",
      url: "https://news.example/articles/first",
      title: "A local-first reader",
      excerpt: "A focused article.",
      contentHtml:
        '<p data-publisher-embed="ignored">Safe <strong>content</strong>.</p><script>alert(1)</script><a href="javascript:alert(1)">Unsafe link</a><a href="https://news.example/story">Safe link</a><img src="https://127.0.0.1/tracker">',
    },
  ],
  fetchedAt: "2026-07-14T10:00:00.000Z",
} as const;

test.beforeEach(async ({ page }) => {
  await page.route("**/api/feed?url=**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(apiResponse),
    });
  });
});

async function openReader(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("navigation", { name: "Reader views" })).toBeVisible({
    timeout: 30_000,
  });
}

test("applies the requested reader color palette", async ({ page }) => {
  await openReader(page, "/unread");

  const colors = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      surface: styles.getPropertyValue("--color-surface").trim(),
      text: styles.getPropertyValue("--color-text").trim(),
      primary: styles.getPropertyValue("--color-primary").trim(),
      accent: styles.getPropertyValue("--color-accent").trim(),
    };
  });

  expect(colors).toEqual({
    surface: "#f8f9fa",
    text: "#212529",
    primary: "#343a40",
    accent: "#adb5bd",
  });
});

test("uses the responsive 1.2 typography scale", async ({ page }) => {
  await openReader(page, "/all");

  const typography = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      ratio: root.getPropertyValue("--typescale-ratio").trim(),
      defaultSize: root.getPropertyValue("--typo-size-default").trim(),
      displaySize: root.getPropertyValue("--typo-size-display").trim(),
      bodySize: getComputedStyle(document.body).fontSize,
    };
  });

  expect(typography.ratio).toBe("1.2");
  expect(typography.defaultSize).toContain("clamp(");
  expect(typography.displaySize).toContain("clamp(");
  expect(typography.bodySize).not.toBe("16px");
});

test("uses logical layout styles and relative hairline tokens", async ({ page }) => {
  await openReader(page, "/all");

  const layout = await page.evaluate(() => {
    const findSidebarRule = (rules: CSSRuleList): CSSStyleRule | undefined => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule && rule.selectorText === ".reader-sidebar") {
          return rule;
        }

        if (rule instanceof CSSGroupingRule) {
          const nestedRule = findSidebarRule(rule.cssRules);
          if (nestedRule) {
            return nestedRule;
          }
        }
      }

      return undefined;
    };
    const sidebarRule = Array.from(document.styleSheets).find((sheet) => {
      try {
        return findSidebarRule(sheet.cssRules);
      } catch {
        return false;
      }
    });
    const style = sidebarRule ? findSidebarRule(sidebarRule.cssRules)?.style : undefined;

    return {
      borderInlineEnd: style?.borderInlineEnd,
      hairline: getComputedStyle(document.documentElement).getPropertyValue("--size-1").trim(),
    };
  });

  expect(layout).toEqual({
    borderInlineEnd: "var(--size-1) solid var(--color-border)",
    hairline: ".0625rem",
  });
});

test("scopes reader navigation transitions to the reading content", async ({ page }) => {
  await openReader(page, "/all");

  await expect(page.locator(".reader-content")).toHaveCSS("view-transition-name", "reader-content");
  await page.getByRole("link", { name: "Unread" }).click();

  await expect(page).toHaveURL(/\/unread$/);
  await expect(page.getByRole("heading", { level: 1, name: "Unread" })).toBeVisible();
});

test("subscribes, reads, and updates local article state accessibly", async ({ page }) => {
  await openReader(page, "/all");
  await page.getByLabel("Feed or website URL").fill("https://news.example/feed.xml");
  await page.getByRole("button", { name: "Add feed" }).click();

  await expect(page.getByRole("link", { name: "A local-first reader" })).toBeVisible();
  await page.getByRole("link", { name: "A local-first reader" }).click();
  await expect(page).toHaveURL(/\/articles\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A local-first reader");
  await expect(page.locator(".article-content p")).toHaveText("Safe content.");
  await expect(page.locator(".article-content strong")).toHaveText("content");
  await expect(page.locator(".article-content [data-publisher-embed]")).toHaveCount(0);
  await expect(page.locator(".article-content script")).toHaveCount(0);
  await expect(page.locator(".article-content img")).toHaveCount(0);
  await expect(page.locator(".article-content a", { hasText: "Unsafe link" })).not.toHaveAttribute(
    "href",
  );
  await expect(page.getByRole("link", { name: "Safe link" })).toHaveAttribute(
    "href",
    "https://news.example/story",
  );
  await expect(page.getByRole("link", { name: "Safe link" })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );

  await page.getByRole("button", { name: "Mark as read" }).click();
  await page.getByRole("button", { name: "Star article" }).click();
  await expect(page.getByRole("button", { name: "Mark as unread" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unstar article" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unstar article" }).locator("svg")).toHaveAttribute(
    "fill",
    "currentColor",
  );
  await expect(page.getByRole("link", { name: "Read on the publisher’s website" })).toHaveAttribute(
    "href",
    "https://news.example/articles/first",
  );
  await page.getByRole("link", { name: "Back to articles" }).click();
  await expect(
    page
      .getByRole("article", { name: "A local-first reader" })
      .getByRole("button", { name: "Unstar A local-first reader" })
      .locator("svg"),
  ).toHaveAttribute("fill", "currentColor");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("supports keyboard entry and keeps routed views usable at each viewport", async ({
  page,
  isMobile,
}) => {
  test.slow(isMobile, "The local store can take longer to initialize under parallel browser load.");
  await openReader(page, "/all");
  if (!isMobile) {
    const skipToMain = page.locator('a.skip-link[href="#main-content"]');
    await expect(skipToMain).toHaveText("Skip to main content");
    await page.keyboard.press("Tab");
    await expect(skipToMain).toBeFocused();
  }
  await page.getByRole("link", { name: "Unread" }).click();
  await expect(page).toHaveURL(/\/unread$/);
  await expect(page.getByRole("heading", { level: 1, name: "Unread" })).toBeVisible();

  await expect(page.getByRole("navigation", { name: "Reader views" })).toMatchAriaSnapshot(`
    - navigation "Reader views":
      - list:
        - listitem:
          - link "All articles"
        - listitem:
          - link "Unread"
        - listitem:
          - link "Starred"
  `);
});

test("renders reader views as compact mobile navigation rows", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The compact navigation treatment is specific to the mobile layout.");

  await openReader(page, "/unread");

  const allArticles = await page.getByRole("link", { name: "All articles" }).boundingBox();
  const unread = await page.getByRole("link", { name: "Unread" }).boundingBox();
  const starred = await page.getByRole("link", { name: "Starred" }).boundingBox();

  expect(allArticles).not.toBeNull();
  expect(unread).not.toBeNull();
  expect(starred).not.toBeNull();

  if (allArticles === null || unread === null || starred === null) {
    throw new Error("Reader view tabs must be visible.");
  }

  expect(Math.abs(allArticles.y - unread.y)).toBeLessThan(1);
  expect(Math.abs(unread.y - starred.y)).toBeLessThan(1);
  expect(unread.x - (allArticles.x + allArticles.width)).toBeGreaterThanOrEqual(8);
  expect(starred.x - (unread.x + unread.width)).toBeGreaterThanOrEqual(8);
  await expect(page.getByRole("link", { name: "Unread" }).locator("svg")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "All articles" })).toHaveCSS(
    "background-color",
    "rgba(255, 255, 255, 0.38)",
  );
  await expect(page.getByRole("link", { name: "Starred" })).toHaveCSS(
    "background-color",
    "rgba(255, 255, 255, 0.38)",
  );
  await expect(page.getByRole("link", { name: "Unread" })).toHaveCSS(
    "background-color",
    "rgb(248, 249, 250)",
  );
  await expect(page.getByRole("link", { name: "Unread" })).toHaveCSS("box-shadow", "none");
});

test("places the desktop subscription composer above the reading content", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The full-width workspace composer is specific to desktop.");

  await openReader(page, "/all");

  const main = await page.getByRole("main").boundingBox();
  const composer = await page.getByRole("region", { name: "Add a subscription" }).boundingBox();
  const addFeed = await page.getByRole("form", { name: "Add a subscription" }).boundingBox();
  const heading = await page.getByRole("heading", { level: 1, name: "All articles" }).boundingBox();

  expect(main).not.toBeNull();
  expect(composer).not.toBeNull();
  expect(addFeed).not.toBeNull();
  expect(heading).not.toBeNull();

  if (main === null || composer === null || addFeed === null || heading === null) {
    throw new Error("The desktop workspace must contain a composer and reading content.");
  }

  expect(composer.x).toBe(main.x);
  expect(composer.width).toBe(main.width);
  expect(addFeed.width).toBeGreaterThan(main.width * 0.7);
  expect(composer.y + composer.height).toBeLessThanOrEqual(heading.y);
});

test("grounds desktop navigation and the subscription composer", async ({ page, isMobile }) => {
  test.skip(isMobile, "The aligned workspace treatment is specific to desktop.");

  await openReader(page, "/all");

  const topBar = page.getByRole("banner", { name: "Reader toolbar" });
  const allArticles = page.getByRole("link", { name: "All articles" });
  const composer = page.getByRole("region", { name: "Add a subscription" });
  const form = composer.getByRole("form", { name: "Add a subscription" });
  const refreshAll = topBar.getByRole("button", { name: "Refresh all feeds" });
  const input = form.getByLabel("Feed or website URL");
  const button = form.getByRole("button", { name: "Add feed" });
  const emptyState = page.locator(".empty-state");

  await expect(form.locator("label")).toHaveClass("visually-hidden");
  await expect(allArticles.locator("svg")).toHaveCount(1);
  await expect(allArticles).toHaveCSS("background-color", "rgb(248, 249, 250)");

  const topBarBox = await topBar.boundingBox();
  const allArticlesBox = await allArticles.boundingBox();
  const formBox = await form.boundingBox();
  const refreshAllBox = await refreshAll.boundingBox();
  const inputBox = await input.boundingBox();
  const buttonBox = await button.boundingBox();

  expect(topBarBox).not.toBeNull();
  expect(allArticlesBox).not.toBeNull();
  expect(formBox).not.toBeNull();
  expect(refreshAllBox).not.toBeNull();
  expect(inputBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();

  if (
    topBarBox === null ||
    allArticlesBox === null ||
    formBox === null ||
    refreshAllBox === null ||
    inputBox === null ||
    buttonBox === null
  ) {
    throw new Error("The desktop top bar, navigation, and composer must be visible.");
  }

  expect(topBarBox.height).toBeLessThanOrEqual(64);
  expect(formBox.y).toBeGreaterThanOrEqual(topBarBox.y + topBarBox.height);
  expect(
    Math.abs(refreshAllBox.x + refreshAllBox.width - (formBox.x + formBox.width)),
  ).toBeLessThanOrEqual(1);
  expect(inputBox.width + buttonBox.width).toBeGreaterThan(formBox.width * 0.8);
  await expect(composer).toHaveCSS("background-color", "rgb(248, 249, 250)");
  await expect(emptyState).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("aligns subscription feed titles with the subscriptions section on desktop", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The vertical sidebar alignment is specific to desktop.");

  await openReader(page, "/all");
  await page.getByLabel("Feed or website URL").fill("https://news.example/feed.xml");
  await page.getByRole("button", { name: "Add feed" }).click();

  const feedLink = page.getByRole("link", { name: "Example News" });
  const sectionHeading = page.locator("#subscriptions-heading");
  const feedBox = await feedLink.boundingBox();
  const headingBox = await sectionHeading.boundingBox();
  const feedPadding = await feedLink.evaluate((link) =>
    Number.parseFloat(getComputedStyle(link).paddingLeft),
  );

  expect(feedBox).not.toBeNull();
  expect(headingBox).not.toBeNull();

  if (feedBox === null || headingBox === null) {
    throw new Error("The subscriptions label and feed title must be visible.");
  }

  expect(Math.abs(feedBox.x + feedPadding - headingBox.x)).toBeLessThanOrEqual(1);
});

test("aligns the sidebar heading with the composer and keeps empty copy on the content rail", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The desktop shell has a dedicated sidebar and content rail.");

  await openReader(page, "/all");

  const navigation = await page.getByRole("navigation", { name: "Reader views" }).boundingBox();
  const input = await page.getByLabel("Feed or website URL").boundingBox();
  const heading = await page.getByRole("heading", { level: 1, name: "All articles" }).boundingBox();
  const emptyCopy = await page.getByText("Nothing to read here yet.").boundingBox();

  expect(navigation).not.toBeNull();
  expect(input).not.toBeNull();
  expect(heading).not.toBeNull();
  expect(emptyCopy).not.toBeNull();

  if (navigation === null || input === null || heading === null || emptyCopy === null) {
    throw new Error("The reader shell must show its navigation, heading, and empty state.");
  }

  expect(Math.abs(navigation.y - input.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(emptyCopy.x - heading.x)).toBeLessThanOrEqual(1);
});

test("separates the reading-list label from its navigation items", async ({ page }) => {
  await openReader(page, "/all");

  const label = await page.locator("#reader-navigation > .sidebar-heading-label").boundingBox();
  const firstView = await page.getByRole("link", { name: "All articles" }).boundingBox();

  expect(label).not.toBeNull();
  expect(firstView).not.toBeNull();

  if (label === null || firstView === null) {
    throw new Error("The reader navigation label and first view must be visible.");
  }

  expect(firstView.y - (label.y + label.height)).toBeGreaterThanOrEqual(8);
});

test("uses compact, modern action buttons", async ({ page }) => {
  await openReader(page, "/all");

  const refreshAll = page.getByRole("button", { name: "Refresh all feeds" });
  const addFeed = page.getByRole("button", { name: "Add feed" });

  await expect(refreshAll).toHaveCSS("border-radius", "6px");
  await expect(refreshAll).toHaveCSS("font-weight", "500");
  await expect(addFeed).toHaveCSS("border-radius", "6px");
  await expect(addFeed).toHaveCSS("font-weight", "500");
  await expect(addFeed).toHaveCSS("background-color", "rgb(52, 58, 64)");
});

test("uses accessible icons for reader actions", async ({ page }) => {
  await openReader(page, "/all");

  const refreshAll = page.getByRole("button", { name: "Refresh all feeds" });
  const addFeed = page.getByRole("button", { name: "Add feed" });
  await expect(refreshAll.locator("svg")).toHaveCount(1);
  await expect(refreshAll).toHaveAttribute("title", "Refresh all feeds");
  await expect(addFeed.locator("svg")).toHaveCount(1);

  await page.getByLabel("Feed or website URL").fill("https://news.example/feed.xml");
  await addFeed.click();

  const refreshFeed = page.getByRole("button", { name: "Refresh Example News" });
  const removeFeed = page.getByRole("button", { name: "Remove Example News" });
  await expect(refreshFeed.locator("svg")).toHaveCount(1);
  await expect(removeFeed.locator("svg")).toHaveCount(1);
  await expect(removeFeed).toHaveAttribute("title", "Remove Example News");
});

test("keeps the mobile subscription header compact after subscribing", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Mobile header layout is covered by the mobile project.");

  await openReader(page, "/unread");
  await page.getByLabel("Feed or website URL").fill("https://news.example/feed.xml");
  await page.getByRole("button", { name: "Add feed" }).click();

  const feedItem = page.locator(".feed-item").filter({ hasText: "Example News" });
  await expect(feedItem).toBeVisible();

  const feedLinkBox = await feedItem.getByRole("link", { name: "Example News" }).boundingBox();
  const feedActionsBox = await feedItem.locator(".feed-item-actions").boundingBox();
  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);

  expect(feedLinkBox).not.toBeNull();
  expect(feedActionsBox).not.toBeNull();
  expect(scrollWidth).toBeLessThanOrEqual(viewportWidth);
  expect(Math.abs(feedLinkBox!.y - feedActionsBox!.y)).toBeLessThan(12);
  expect(feedLinkBox!.x).toBeLessThan(feedActionsBox!.x);

  const addFeedBorder = await page
    .getByRole("form", { name: "Add a subscription" })
    .evaluate((form) => getComputedStyle(form).borderBlockStartWidth);
  expect(addFeedBorder).toBe("0px");
});

test("gives mobile subscription rows a soft raised surface", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The raised subscription rows are specific to the mobile layout.");

  await openReader(page, "/unread");
  await page.getByLabel("Feed or website URL").fill("https://news.example/feed.xml");
  await page.getByRole("button", { name: "Add feed" }).click();

  const feedItem = page.locator(".feed-item").filter({ hasText: "Example News" });
  await expect(feedItem).toHaveCSS("background-color", "rgba(255, 255, 255, 0.72)");
});

test("keeps an empty mobile subscriptions section compact", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The compact empty subscriptions section is specific to mobile.");

  await openReader(page, "/unread");

  const sidebar = await page.getByRole("complementary").boundingBox();
  const composer = await page.getByRole("region", { name: "Add a subscription" }).boundingBox();

  expect(sidebar).not.toBeNull();
  expect(composer).not.toBeNull();

  if (sidebar === null || composer === null) {
    throw new Error("The mobile sidebar and subscription composer must be visible.");
  }

  expect(sidebar.height).toBeLessThanOrEqual(220);
  expect(Math.abs(composer.y - (sidebar.y + sidebar.height))).toBeLessThanOrEqual(1);
});

test("keeps the mobile subscription list separate from the main composer", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "The stacked mobile layout is covered by the mobile project.");

  await openReader(page, "/unread");
  await page.getByLabel("Feed or website URL").fill("https://news.example/feed.xml");
  await page.getByRole("button", { name: "Add feed" }).click();

  const subscriptions = page.getByRole("region", { name: "Subscriptions" });
  await expect(subscriptions).toBeVisible();
  await expect(subscriptions.getByRole("button", { name: "Refresh all feeds" })).toHaveCount(0);
  await expect(
    page.getByRole("banner", { name: "Reader toolbar" }).getByRole("button", {
      name: "Refresh all feeds",
    }),
  ).toBeVisible();
  await expect(subscriptions.getByRole("link", { name: "Example News" })).toBeVisible();
  await expect(subscriptions.getByRole("form", { name: "Add a subscription" })).toHaveCount(0);
  await expect(
    page.getByRole("main").getByRole("form", { name: "Add a subscription" }),
  ).toBeVisible();

  const subscriptionsBox = await subscriptions.boundingBox();
  expect(subscriptionsBox).not.toBeNull();
  expect(subscriptionsBox!.height).toBeLessThanOrEqual(180);
});
