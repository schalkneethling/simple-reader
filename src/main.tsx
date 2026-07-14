import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import { ReaderApp } from "./app/ReaderApp";
import { LocalReaderService, requestFeedApi } from "./app/reader-service";
import { ReaderRepository } from "./data/reader-repository";
import { registerServiceWorker } from "./pwa";
import "./styles/app.css";

const container = document.querySelector<HTMLDivElement>("#app");
if (container === null) throw new Error("The application root is missing.");

const root = createRoot(container);

async function start(): Promise<void> {
  const repository = new ReaderRepository();
  const service = new LocalReaderService(repository, requestFeedApi);

  try {
    await repository.open();
    const snapshot = await service.snapshot();
    root.render(
      <StrictMode>
        <BrowserRouter>
          <ReaderApp
            service={service}
            initialFeeds={snapshot.feeds}
            initialArticles={snapshot.articles}
          />
        </BrowserRouter>
      </StrictMode>,
    );
  } catch {
    root.render(
      <main className="reader-main">
        <h1>Simple Reader could not start</h1>
        <p role="alert">Local storage is unavailable. Check your browser settings and reload.</p>
      </main>,
    );
  }
}

void start();
registerServiceWorker();
