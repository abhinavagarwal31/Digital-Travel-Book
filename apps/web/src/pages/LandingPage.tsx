import { Link } from 'react-router';
import { BookCover } from '../components/BookCover.tsx';

const SAMPLE_BOOK = {
  id: 'sample-kyoto',
  title: 'Whispers of Japan',
  startDate: '2026-10-10',
  endDate: '2026-10-15',
  destinations: ['Tokyo', 'Kyoto', 'Osaka'],
};

function RouteArt() {
  return (
    <svg className="route" viewBox="0 0 400 360" aria-hidden="true" fill="none">
      <path
        d="M24 318 C 10 230, 30 150, 52 96 S 150 14, 230 22 S 372 40, 380 120 S 392 260, 360 330"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeDasharray="2 10"
        strokeLinecap="round"
      />
      {[
        [24, 318],
        [52, 96],
        [230, 22],
        [380, 120],
        [360, 330],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle
            cx={x}
            cy={y}
            r="9"
            fill="var(--surface)"
            stroke="currentColor"
            strokeWidth="2.5"
          />
          <text x={x} y={(y as number) + 4} textAnchor="middle" fontSize="10" fill="currentColor">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

const FEATURES = [
  {
    title: 'Sorted for you',
    body: 'Photos fall into days and places from their own timestamps and locations. Anything uncertain waits for you, never a guess.',
    icon: 'M4 7h16M4 12h10M4 17h6',
  },
  {
    title: 'Your words, not AI’s',
    body: 'Captions and daily diary entries are yours alone. Nothing about your trip is ever made up.',
    icon: 'M5 19l3-1 9-9-2-2-9 9-1 3zM14 6l2 2',
  },
  {
    title: 'A book that turns',
    body: 'Chapter maps of the places you photographed, three hand-made themes, and real pages that flip.',
    icon: 'M4 6c3-1.3 5.5-1.3 8 0v12c-2.5-1.3-5-1.3-8 0zM12 6c2.5-1.3 5-1.3 8 0v12c-3-1.3-5.5-1.3-8 0z',
  },
];

/** What a visitor sees before logging in. */
export function LandingPage() {
  return (
    <div className="stack" style={{ gap: '3rem' }}>
      <section className="hero">
        <div>
          <p className="eyebrow">Your trips, bound beautifully</p>
          <h1>
            Turn a camera roll into a <em>book</em> you’ll want to reopen.
          </h1>
          <p className="lede">
            Upload your travel photos. They sort themselves into days and chapters, you add the
            stories, and the trip becomes a book you can page through.
          </p>
          <div className="actions">
            <Link to="/register" className="button large">
              Start your first book
            </Link>
            <Link to="/login" className="button ghost large">
              Log in
            </Link>
          </div>
        </div>
        <div className="hero-art">
          <RouteArt />
          <div style={{ width: 'min(260px, 70%)' }}>
            <BookCover book={SAMPLE_BOOK} />
          </div>
        </div>
      </section>

      <section className="features" aria-label="What it does">
        {FEATURES.map((feature) => (
          <article key={feature.title} className="card feature">
            <span className="feature-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d={feature.icon}
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <h3>{feature.title}</h3>
            <p className="muted">{feature.body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
