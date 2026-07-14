import { describe, expect, it, vi } from "vite-plus/test";

import { registerServiceWorker } from "./pwa";

describe("registerServiceWorker", () => {
  it("registers the service worker after the page has loaded", () => {
    const register = vi.fn();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });

    registerServiceWorker();
    window.dispatchEvent(new Event("load"));

    expect(register).toHaveBeenCalledWith("/service-worker.js", { scope: "/" });
  });
});
