import { useId, useState } from "react";
import { Plus } from "lucide-react";
import type { FeedChoice } from "../domain/types";
import type { SubscriptionResult, SubscriptionTimeframe } from "../app/contracts";

interface AddFeedFormProps {
  onSubscribe: (url: string, timeframe: SubscriptionTimeframe) => Promise<SubscriptionResult>;
}

function normalizeHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hostname === ""
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function AddFeedForm({ onSubscribe }: AddFeedFormProps) {
  const inputId = useId();
  const timeframeId = useId();
  const errorId = useId();
  const [value, setValue] = useState("");
  const [timeframe, setTimeframe] = useState<SubscriptionTimeframe>("7-days");
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<FeedChoice[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function subscribe(url: string) {
    setSubmitting(true);
    setError(null);
    try {
      const result = await onSubscribe(url, timeframe);
      if (result.status === "error") {
        setError(result.message);
      } else if (result.status === "choices") {
        setChoices(result.choices);
      } else {
        setChoices([]);
        setValue("");
      }
    } catch {
      setError("The feed could not be added. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = normalizeHttpsUrl(value);
    if (url === null) {
      setError("Enter a valid HTTPS URL.");
      setChoices([]);
      return;
    }
    await subscribe(url);
  }

  return (
    <form className="add-feed" aria-label="Add a subscription" onSubmit={handleSubmit} noValidate>
      <label htmlFor={timeframeId}>Load posts from</label>
      <select
        id={timeframeId}
        value={timeframe}
        disabled={submitting}
        onChange={(event) => {
          const selected = event.currentTarget.value;
          if (selected === "7-days" || selected === "30-days" || selected === "all") {
            setTimeframe(selected);
          }
        }}
      >
        <option value="7-days">Last 7 days</option>
        <option value="30-days">Last 30 days</option>
        <option value="all">All time</option>
      </select>
      <label className="visually-hidden" htmlFor={inputId}>
        Feed or website URL
      </label>
      <div className="add-feed-controls">
        <input
          id={inputId}
          type="url"
          inputMode="url"
          autoComplete="url"
          value={value}
          disabled={submitting}
          aria-describedby={error === null ? undefined : errorId}
          aria-invalid={error === null ? undefined : true}
          onChange={(event) => setValue(event.currentTarget.value)}
          placeholder="https://example.com/feed.xml"
        />
        <button type="submit" disabled={submitting}>
          <Plus aria-hidden="true" />
          <span>{submitting ? "Adding…" : "Add feed"}</span>
        </button>
      </div>
      {error === null ? null : (
        <p id={errorId} className="message message-error" role="alert">
          {error}
        </p>
      )}
      {choices.length === 0 ? null : (
        <fieldset className="feed-choices" disabled={submitting}>
          <legend>Choose a feed</legend>
          <ul>
            {choices.map((choice) => (
              <li key={choice.url}>
                <button type="button" onClick={() => subscribe(choice.url)}>
                  {choice.title}
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
    </form>
  );
}
