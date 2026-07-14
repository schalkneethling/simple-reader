# Simple Reader v1 implementation plan

## Goal

Build a local-first, single-browser RSS reader using React 19, TypeScript, React Router 8, IndexedDB, and a Cloudflare Worker that also runs locally through Wrangler. The reader accepts only HTTPS feed or website targets and retains the latest 200 non-starred articles per feed while preserving starred articles.

## Delivery principles

- Follow strict red/green/refactor TDD for every behavioral slice.
- Keep the initial implementation as the sole exception permitted directly on `main`; all follow-up work uses an updated feature branch.
- Delegate bounded, non-overlapping work to suitable sub-agents and review all contributions centrally.
- Use Varlock for configuration and secrets. Never inspect, print, request, or commit raw secret values.
- Use `gh` for GitHub operations unless the in-app connector is demonstrably reliable for the exact operation.
- Read and follow the applicable project-local skills referenced by `AGENTS.md` and `CLAUDE.md` rather than duplicating them here.

## Architecture

### Browser application

- React 19 and React DOM.
- Stable React Router 8 through `react-router`; do not add `react-router-dom`.
- Routed views for all, unread, starred, individual feeds, and individual articles.
- Two-pane desktop reader with dedicated routed views for articles and narrow screens.
- Semantic landmarks, skip links, heading hierarchy, lists, forms, links, and buttons.
- Native CSS based on project tokens, logical properties, bounded responsive queries, and user preference media queries.

### Local persistence

- Dexie 4 with versioned `feeds`, `articles`, and `settings` stores.
- Deduplicate by feed plus GUID, then canonical HTTPS URL, then deterministic content hash.
- Retain the latest 200 non-starred articles per feed.
- Preserve starred articles until they are unstarred or their feed is removed.
- Persist subscriptions, refresh metadata, read state, and star state locally.
- Fall back to a typed native IndexedDB repository if Dexie becomes unsuitable.

### Feed Worker

- Serve SPA assets and `GET /api/feed?url=<encoded-url>` from one Worker.
- Return normalized `ready`, `choices`, or `error` responses only; never act as a general content proxy.
- Accept only absolute HTTPS targets without credentials or nonstandard ports.
- Reject IP literals, localhost, private destinations, malformed URLs, unsafe redirects, protocol downgrades, excessive redirects, oversized responses, and timeouts.
- Parse bounded RSS 2.x and Atom documents with `fast-xml-parser` 5.
- Discover HTTPS feed links from HTTPS websites and support multiple-feed selection.
- Cache normalized successful responses for five minutes and apply Cloudflare rate limiting.
- Emit bounded structured diagnostics without raw URLs, query strings, response bodies, or exception messages.
- Retain the original error cause only for a trusted reporter integration such as Sentry, with transport-level scrubbing added before Sentry is enabled.

### Article rendering

- Treat publisher XML, HTML, API data, and IndexedDB content as untrusted.
- Keep `dangerouslySetInnerHTML` in one `ArticleContent` component.
- Pass content through DOMPurify with an explicit element and attribute allowlist.
- Strip data/ARIA attributes and preserve DOM-clobbering protection.
- Permit navigation and embedded images only for validated public HTTPS URLs.
- Add `noopener noreferrer` and a no-referrer policy to publisher links.
- Render escaped plain text when trustworthy sanitization is unavailable.

### Configuration and deployment

- Use maintained stable `varlock` and `@varlock/cloudflare-integration` packages.
- Commit `.env.schema` and non-sensitive defaults only.
- Read typed configuration through `ENV` from `varlock/env` or the Cloudflare integration entry point.
- Keep `nodejs_compat`, Varlock log redaction, and response leak detection enabled.
- Use `varlock-wrangler` for local development, type generation, and deployment.
- Do not use `.dev.vars`, direct `wrangler secret put`, hardcoded secrets, or independently managed Worker runtime secrets.

## TDD delivery sequence

For each slice, first add an acceptance-level test that fails because behavior is absent, add the minimum implementation to make it pass, then refactor while keeping the relevant suite green.

1. Application shell and routing.
2. HTTPS URL and destination policy.
3. RSS/Atom parsing and website discovery.
4. IndexedDB schema, migrations, deduplication, and 200-item retention.
5. Subscription and article-list workflows.
6. Refresh orchestration, caching, and failure states.
7. Sanitized article rendering.
8. Responsive accessibility and performance.
9. Workerd runtime regressions and structured outbound-fetch diagnostics.

## Refresh behavior

- Refresh feeds older than 30 minutes on startup and window focus.
- Support global and per-feed manual refresh.
- Limit refreshes to four concurrent requests.
- Preserve cached content and surface accessible failure states when refresh fails.

## Validation

- Vitest for pure logic and Worker units.
- Testing Library with `happy-dom` for component behavior that does not require a real browser security implementation.
- Fake IndexedDB for repository and migration behavior.
- A dedicated workerd Vitest project for runtime-specific Worker behavior.
- Playwright Chromium coverage for subscribe-to-read workflows, responsive routing, semantic structure, keyboard/focus behavior, DOMPurify rendering, and WCAG 2.2 AA axe scans.
- Validate RSS, Atom, discovery, malformed input, normalization, redirects, payload limits, timeouts, caching, rate limiting, sanitization, persistence, migrations, deduplication, and retention.
- Milestone checks: `vp check`, `vp test`, `npm run test:worker-runtime`, `npm run test:e2e`, production build, stylelint, React Doctor, `npm audit`, `varlock load`, `varlock scan`, and a local `varlock-wrangler` smoke test.

## Dependency policy

- Before installation, verify that each package is maintained, non-archived, runtime-compatible, appropriately scoped, and free of unresolved critical advisories.
- Inspect ownership, lifecycle scripts, native behavior, and dependency size.
- Commit resolved versions through `package-lock.json`.
- Prefer plain text rendering if no trustworthy maintained sanitizer is available.
- Prefer a bounded non-regex parser if no maintained compatible XML parser is available.
- Maintain the project-skill Dependabot configuration for npm and GitHub Actions.

## V1 boundaries

- Single user and single browser.
- No authentication or cross-device sync.
- No folders, tags, search, OPML, notifications, recommendations, full-page extraction, background scheduling, or PWA shell.
- HTTP targets are rejected rather than upgraded.

## Current implementation status

- Core React application, routing, persistence, Worker API, HTTPS policy, parsing, discovery, sanitization, Varlock integration, and validation suites are implemented.
- Article retention is set to 200 non-starred items per feed.
- Workerd native-fetch receiver regression coverage and safe structured diagnostics are implemented.
- Publisher HTML rendering now strips unexpected data/ARIA attributes without falling back to escaped markup.
- Continue remaining work from feature branches using this plan and the repository guidance files.
