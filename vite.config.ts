import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react()],
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [
      ".agents/**",
      ".calavera/**",
      ".codex/**",
      ".tokensave/**",
      ".vite-hooks/**",
      "dist/**",
      "env.d.ts",
      "worker-configuration.d.ts",
    ],
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "worker/**/*.test.ts"],
    exclude: ["worker/**/*.workerd.test.ts"],
    coverage: { reporter: ["text", "html"] },
  },
});
