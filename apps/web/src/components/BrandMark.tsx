/** The app mark: a sunrise over two mountains, inside a map pin's tile. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="brand-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b4f6c" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#brand-sky)" />
      <circle cx="20.5" cy="12" r="4" fill="#f5a524" />
      <path d="M3 25l8-11 4.5 6 3.5-4.5L29 25z" fill="#ffffff" />
      <path d="M11 14l2.4 3.2-2.4-1-2.2 1.4z" fill="#d3efe9" />
      <path d="M3 25h26v1.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" fill="#0a3d4f" />
    </svg>
  );
}
