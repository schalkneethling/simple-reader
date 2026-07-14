import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { afterEach } from "vite-plus/test";

afterEach(() => {
  document.body.innerHTML = "";
});
