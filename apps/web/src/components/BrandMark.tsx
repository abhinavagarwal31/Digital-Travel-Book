/** The app mark: an open book whose pages carry a dotted route. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M6 10.5c3.2-1.4 6.6-1.4 10 0v13c-3.4-1.4-6.8-1.4-10 0z" fill="#fffaf2" />
      <path d="M16 10.5c3.4-1.4 6.8-1.4 10 0v13c-3.2-1.4-6.6-1.4-10 0z" fill="#f3e6d3" />
      <path
        d="M8.5 20c1.5-2.5 3-1 4.5-3.5M18.5 15.5c1.5 2.2 3 0.5 4.5 3"
        stroke="var(--accent)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeDasharray="0.1 2.2"
        fill="none"
      />
    </svg>
  );
}
