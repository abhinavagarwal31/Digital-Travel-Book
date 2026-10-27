import { coverDesignOf, PLANS, PRESET_THEMES, type ThemeId, type TripPath } from '@tb/shared';
import { lazy, Suspense, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { CoverArt } from '../components/BookCover.tsx';

const WorldMap = lazy(() => import('../components/WorldMap.tsx'));

/** A sample trip, drawn the same way a real one is. */
const SAMPLE = {
  id: 'sample-kyoto',
  title: 'Whispers of Japan',
  dates: '10 – 15 Oct 2026',
  places: ['Tokyo', 'Kyoto', 'Osaka'],
};

const SAMPLE_TRIPS: TripPath[] = [
  {
    bookId: 'kerala',
    title: 'Monsoon in Kerala',
    startDate: '2026-07-02',
    points: [
      { lat: 9.93, lng: 76.27 },
      { lat: 10.09, lng: 77.06 },
      { lat: 9.49, lng: 76.33 },
    ],
  },
  {
    bookId: 'swiss',
    title: 'Swiss Alps by Train',
    startDate: '2026-05-14',
    points: [
      { lat: 47.37, lng: 8.54 },
      { lat: 47.05, lng: 8.31 },
      { lat: 46.02, lng: 7.75 },
    ],
  },
  {
    bookId: 'japan',
    title: 'Whispers of Japan',
    startDate: '2026-10-10',
    points: [
      { lat: 35.68, lng: 139.69 },
      { lat: 35.01, lng: 135.77 },
      { lat: 34.69, lng: 135.5 },
    ],
  },
  {
    bookId: 'rajasthan',
    title: 'Rajasthan Road Trip',
    startDate: '2026-11-14',
    points: [
      { lat: 26.91, lng: 75.79 },
      { lat: 26.24, lng: 73.02 },
      { lat: 26.92, lng: 70.91 },
    ],
  },
];

/** A sample book's cover in one of the styles, exactly as the app draws it. */
function SampleCover({ themeId, className }: { themeId: ThemeId; className?: string }) {
  const theme = PRESET_THEMES.find((t) => t.id === themeId)!.definition;
  const design = coverDesignOf(theme);
  return (
    <div
      className={`cover ${design === 'comic' ? 'comic' : 'designed'} ${className ?? ''}`}
      style={
        {
          '--cover': theme.colors.cover ?? '#1f4e5a',
          '--cover-ink': theme.colors.coverInk,
        } as CSSProperties
      }
    >
      <CoverArt
        design={design}
        bookId={SAMPLE.id}
        title={SAMPLE.title}
        dates={SAMPLE.dates}
        places={SAMPLE.places}
        animate="always"
        headingLevel={null}
      />
    </div>
  );
}

/** Sunrise over mountains and sea, with a flight path across the sky: the hero's backdrop. */
function HeroScene() {
  return (
    <svg
      className="hero-scene"
      viewBox="0 0 1440 640"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a2f4a" />
          <stop offset="0.45" stopColor="#1a7f95" />
          <stop offset="0.75" stopColor="#7fc4bf" />
          <stop offset="1" stopColor="#ffd59a" />
        </linearGradient>
        <radialGradient id="hs-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe3a3" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffe3a3" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hs-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a7480" />
          <stop offset="1" stopColor="#06303a" />
        </linearGradient>
      </defs>
      <rect width="1440" height="640" fill="url(#hs-sky)" />
      <circle cx="1330" cy="330" r="240" fill="url(#hs-glow)" />
      <circle cx="1330" cy="330" r="54" fill="#ffd486" />
      <path
        className="hs-flight"
        d="M-40 300 C 260 140, 620 120, 900 190 S 1320 300, 1500 170"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.55"
        strokeWidth="2"
        strokeDasharray="2 12"
        strokeLinecap="round"
      />
      <path d="M1000 180 l22 -6 -6 6 6 6z" fill="#ffffff" opacity="0.9" />
      <g fill="none" stroke="#06283a" strokeOpacity="0.55" strokeWidth="2.2" strokeLinecap="round">
        <path d="M300 220 q8 -8 16 0 q8 -8 16 0" />
        <path d="M352 200 q6 -6 12 0 q6 -6 12 0" />
        <path d="M1180 250 q7 -7 14 0 q7 -7 14 0" />
      </g>
      <path
        d="M0 470 L120 380 L210 430 L330 320 L450 420 L560 360 L700 450 L820 370 L930 440 L1060 350 L1180 420 L1300 340 L1440 420 V640 H0 Z"
        fill="#3d8a8f"
        opacity="0.55"
      />
      <path
        d="M0 520 L150 420 L260 480 L400 380 L520 470 L640 410 L780 500 L900 430 L1020 500 L1160 400 L1290 470 L1440 410 V640 H0 Z"
        fill="#1d5c66"
      />
      <path
        d="M0 560 L180 480 L300 530 L460 450 L600 520 L760 470 L900 540 L1080 470 L1240 530 L1440 480 V640 H0 Z"
        fill="#0f3f4a"
      />
      <rect y="575" width="1440" height="65" fill="url(#hs-sea)" />
      <g stroke="#ffd486" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round">
        <path d="M1280 592 h100" />
        <path d="M1300 606 h60" />
        <path d="M1315 620 h30" />
      </g>
    </svg>
  );
}

const STEPS = [
  {
    title: 'Upload the trip',
    body: 'Drop in JPEG, PNG, WebP or HEIC photos straight from your phone. Uploads retry by themselves on a shaky connection.',
  },
  {
    title: 'It sorts itself',
    body: 'Each photo’s own time and GPS place it in a day and a chapter. Anything uncertain waits for you on a drag-and-drop board: nothing is guessed.',
  },
  {
    title: 'Write it, then read it',
    body: 'Add captions and a diary for each day, pick a style, and page through a real book with maps of everywhere you went.',
  },
];

const FEATURES = [
  {
    title: 'Organised by the photos themselves',
    body: 'Capture time, time zone and location are read from each photo on the server, so days line up even across time zones.',
    icon: 'M4 7h16M4 12h10M4 17h6',
  },
  {
    title: 'Chapters and maps',
    body: 'Days group into chapters by place. Every chapter opens with a map of its stops, and the book opens with your whole route.',
    icon: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  },
  {
    title: 'A book that really turns',
    body: 'Pages curl as you drag a corner, covers swing open, and focus mode dims everything but the book.',
    icon: 'M4 6c3-1.3 5.5-1.3 8 0v12c-2.5-1.3-5-1.3-8 0zM12 6c2.5-1.3 5-1.3 8 0v12c-3-1.3-5.5-1.3-8 0z',
  },
  {
    title: 'Ten traveller’s styles',
    body: 'A leather journal, a passport, an airmail envelope, a luggage tag, a comic and more, each with pages to match.',
    icon: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z',
  },
  {
    title: 'Your words, never invented',
    body: 'Captions and diaries are yours alone. Dates, places and memories are never made up to fill a page.',
    icon: 'M5 19l3-1 9-9-2-2-9 9-1 3zM14 6l2 2',
  },
  {
    title: 'Private by default',
    body: 'Photos are only ever shown to you. Passwords are stored as salted scrypt hashes and sessions live in HTTP-only cookies.',
    icon: 'M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6zM9 12l2 2 4-4',
  },
];

const SHOWCASE: { id: ThemeId; label: string }[] = [
  { id: 'traveller', label: 'Traveller’s Journal' },
  { id: 'midnight', label: 'Midnight passport' },
  { id: 'postcard', label: 'Vintage Postcard' },
  { id: 'scrapbook', label: 'Scrapbook' },
  { id: 'atlas', label: 'Illustrated Atlas' },
  { id: 'comic', label: 'Comic Adventure' },
];

/** What a visitor sees before signing up: what Wanderbook is, how it works, and why. */
export function LandingPage() {
  return (
    <div className="landing">
      <section className="hero">
        <HeroScene />
        <div>
          <p className="eyebrow">Wanderbook · your trips, bound beautifully</p>
          <h1>
            Turn a camera roll into a <em>book</em> you’ll want to reopen.
          </h1>
          <p className="lede">
            Upload your travel photos. They sort themselves into days and chapters from their own
            time and place, you add the stories, and the trip becomes a book with real turning
            pages.
          </p>
          <div className="actions">
            <Link to="/register" className="button large">
              Start your first book
            </Link>
            <Link to="/login" className="button ghost large">
              Log in
            </Link>
          </div>
          <p className="hero-note muted">
            Free to start: up to {PLANS.free.photosPerBook} photos in every book.
          </p>
        </div>
        <div className="hero-covers" aria-hidden="true">
          <SampleCover themeId="postcard" className="fan left" />
          <SampleCover themeId="comic" className="fan right" />
          <SampleCover themeId="traveller" className="fan front" />
        </div>
      </section>

      <section className="landing-section" aria-labelledby="how-heading">
        <p className="eyebrow">How it works</p>
        <h2 id="how-heading">From hundreds of photos to a finished book in three steps</h2>
        <ol className="steps">
          {STEPS.map((step, i) => (
            <li key={step.title} className="card step">
              <span className="step-number" aria-hidden="true">
                {i + 1}
              </span>
              <h3>{step.title}</h3>
              <p className="muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section landing-world" aria-labelledby="world-heading">
        <div className="landing-world-text">
          <p className="eyebrow">Your world, mapped</p>
          <h2 id="world-heading">Every trip you keep becomes a pin on your own map</h2>
          <p className="muted">
            Your library opens on a map of everywhere your photos were taken: each trip a coloured
            route, each country you’ve visited named.
          </p>
        </div>
        <Suspense fallback={<div className="world-map placeholder" />}>
          <WorldMap trips={SAMPLE_TRIPS} />
        </Suspense>
      </section>

      <section className="landing-section" aria-labelledby="features-heading">
        <p className="eyebrow">What it does</p>
        <h2 id="features-heading">Built for travellers, not for photo dumps</h2>
        <div className="features">
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
        </div>
      </section>

      <section className="landing-section" aria-labelledby="styles-heading">
        <p className="eyebrow">Styles</p>
        <h2 id="styles-heading">Bind every trip its own way</h2>
        <ul className="style-showcase">
          {SHOWCASE.map((style) => (
            <li key={style.id}>
              <SampleCover themeId={style.id} />
              <span>{style.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-cta">
        <h2>Your next trip deserves more than a camera roll.</h2>
        <p>Create a free account and turn your last trip into a book tonight.</p>
        <Link to="/register" className="button large">
          Create your free account
        </Link>
      </section>

      <footer className="landing-footer muted">
        <span>Wanderbook</span>
        <span>A travel book made from your own photos and words.</span>
      </footer>
    </div>
  );
}
