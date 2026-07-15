import { describe, expect, it } from "vite-plus/test";

import wranglerConfig from "../wrangler.jsonc?raw";

describe("Worker compatibility configuration", () => {
  it("routes global fetches through the public Internet", () => {
    expect(wranglerConfig).toMatch(
      /"compatibility_flags":\s*\["nodejs_compat",\s*"global_fetch_strictly_public"\]/,
    );
  });
});
