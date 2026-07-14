import { BookOpen, RefreshCw } from "lucide-react";
import { ViewTransitionLink } from "./ViewTransitionLink";

interface ReaderTopbarProps {
  busy: boolean;
  onRefresh: () => void;
}

export function ReaderTopbar({ busy, onRefresh }: ReaderTopbarProps) {
  return (
    <header className="app-topbar" aria-label="Reader toolbar">
      <ViewTransitionLink className="topbar-brand" to="/all" aria-label="Simple Reader">
        <BookOpen aria-hidden="true" />
        <span>Simple Reader</span>
      </ViewTransitionLink>
      <button
        className="topbar-refresh"
        type="button"
        aria-label="Refresh all feeds"
        title="Refresh all feeds"
        onClick={onRefresh}
        disabled={busy}
      >
        <RefreshCw aria-hidden="true" />
        <span>Refresh all</span>
      </button>
    </header>
  );
}
