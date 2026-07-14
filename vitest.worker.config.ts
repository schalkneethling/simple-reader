import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineProject } from "vite-plus";

const RSS_FIXTURE = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Runtime fixture</title>
<link>https://runtime-fixture.example/</link><description>Workerd integration</description>
<item><guid>runtime-one</guid><title>Runtime article</title>
<link>https://runtime-fixture.example/articles/one</link></item>
</channel></rss>`;

export default defineProject({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-07-14",
        compatibilityFlags: ["nodejs_compat"],
        outboundService: async (request: Request) => {
          const accept = request.headers.get("accept") ?? "";
          if (
            request.method !== "GET" ||
            request.url !== "https://runtime-fixture.example/feed.xml" ||
            !accept.includes("application/rss+xml")
          ) {
            throw new Error("Unexpected outbound request in Worker runtime test");
          }
          return new Response(RSS_FIXTURE, {
            headers: { "content-type": "application/rss+xml" },
          });
        },
      },
    }),
  ],
  test: {
    include: ["worker/**/*.workerd.test.ts"],
  },
});
