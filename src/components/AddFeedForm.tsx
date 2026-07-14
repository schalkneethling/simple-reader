import { useId, useState } from "react";
import { Plus } from "lucide-react";
import type { FeedChoice } from "../domain/types";
import type { SubscriptionResult } from "../app/contracts";

interface AddFeedFormProps {
  onSubscribe: (url: string) => Promise<SubscriptionResult>;
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
  const errorId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<FeedChoice[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function subscribe(url: string) {
    setSubmitting(true);
    setError(null);
    try {
      const result = await onSubscribe(url);
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
        <fieldset className="feed-choices">
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
