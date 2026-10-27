/** Shown while a page's data is on its way. */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="load-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="muted">{label}</span>
    </div>
  );
}

/** A failed load, with a way to try again that does not lose the page. */
export function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="load-state" role="alert">
      <p>Could not load {what}. Check your connection and try again.</p>
      <button type="button" className="button small" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
