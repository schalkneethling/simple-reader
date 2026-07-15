import { describe, expect, it } from "vite-plus/test";

import packageJson from "../package.json?raw";
import wranglerConfig from "../wrangler.jsonc?raw";

describe("Worker compatibility configuration", () => {
  it("routes global fetches through the public Internet", () => {
    expect(wranglerConfig).toMatch(
      /"compatibility_flags":\s*\["nodejs_compat",\s*"global_fetch_strictly_public"\]/,
    );
  });

  it("serves the built SPA while routing API requests through the Worker", () => {
    expect(wranglerConfig).toMatch(
      /"assets":\s*\{[\s\S]*"directory":\s*"\.\/dist"[\s\S]*"not_found_handling":\s*"single-page-application"[\s\S]*"run_worker_first":\s*\["\/api\/\*"\][\s\S]*\}/,
    );
  });

  it("builds SPA assets before starting Wrangler development", () => {
    const manifest = JSON.parse(packageJson) as { scripts?: Record<string, string> };

    expect(manifest.scripts?.predev).toBe("vp run build");
  });
});
