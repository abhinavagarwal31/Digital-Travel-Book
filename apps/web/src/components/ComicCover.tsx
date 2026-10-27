import type { CSSProperties } from 'react';

interface ComicCoverProps {
  title: string;
  dates: string;
  places: string[];
  /** The book's cover colour: the panel's background ink. */
  colour: string;
  /** A photo the owner chose for the cover, printed into the panel. */
  photoUrl?: string | null;
  /** Moving by default; a shelf of covers only moves the one being pointed at. */
  animate?: 'always' | 'hover';
  /** The cover's own heading level: h1 on the book itself, h2 on a shelf, none in a preview. */
  headingLevel?: 1 | 2 | null;
}

/** Long titles get smaller lettering so they still fit the panel. */
export function titleSize(title: string): number {
  const n = title.length;
  if (n <= 10) return 17;
  if (n <= 18) return 14.5;
  if (n <= 30) return 11.5;
  return 9;
}

/** Bright comic skies; each book keeps the same one, picked from its id. */
const COMIC_SKIES = ['#2f9bd6', '#f2665a', '#22a99a', '#7b5ea7', '#f08a24', '#3f9e5a'];

export function comicColour(bookId: string): string {
  let hash = 7;
  for (const char of bookId) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return COMIC_SKIES[hash % COMIC_SKIES.length] as string;
}

/** A small, fixed tilt for each stamp, so they look pressed by hand but never change. */
const STAMP_TILTS = [-8, 6, -3];
const STAMP_INKS = ['#c0392b', '#1d4e89', '#2e7d4f'];

/**
 * A travel book's cover as a comic panel: halftone dots and sunburst rays
 * behind a bold outlined title, narration boxes for what and when, the
 * destinations as passport stamps, and a little plane flying the route.
 * Scales with its box (all sizes in cqw), so one design serves the shelf and
 * the book. Everything in it is the owner's own data.
 */
export function ComicCover({
  title,
  dates,
  places,
  colour,
  photoUrl,
  animate = 'always',
  headingLevel = 1,
}: ComicCoverProps) {
  const Heading = headingLevel === 1 ? 'h1' : headingLevel === 2 ? 'h2' : 'p';
  return (
    <div
      className={`comic-cover${photoUrl ? ' with-photo' : ''}`}
      data-animate={animate}
      style={{ '--cover': colour, '--title-size': `${titleSize(title)}cqw` } as CSSProperties}
    >
      {photoUrl && <img className="comic-photo" src={photoUrl} alt="" draggable={false} />}
      <span className="comic-rays" aria-hidden="true" />
      <span className="comic-halftone" aria-hidden="true" />

      <svg className="comic-sky" viewBox="0 0 300 400" aria-hidden="true">
        {!photoUrl && (
          <g className="comic-scenery">
            <circle className="comic-sun" cx="226" cy="142" r="34" />
            <path className="comic-hill far" d="M-5 318 Q 60 262 140 300 T 305 286 V 405 H -5 Z" />
            <path className="comic-hill near" d="M-5 346 Q 95 300 185 338 T 305 330 V 405 H -5 Z" />
          </g>
        )}
        <g className="comic-cloud drift-a">
          <path d="M40 92 q-2 -16 14 -18 q6 -14 22 -8 q12 -10 24 2 q16 -2 16 14 q10 6 2 14 h-74 q-12 -2 -4 -4z" />
        </g>
        <g className="comic-cloud drift-b">
          <path d="M196 58 q-2 -12 10 -14 q6 -11 18 -6 q10 -8 19 2 q13 -1 12 11 q8 5 1 11 h-58 q-9 -1 -2 -4z" />
        </g>
        {/* The route, and a plane flying it. */}
        <path className="comic-route" d="M-10 150 C 70 70, 200 60, 310 128" />
        <g className="comic-plane-x">
          <g className="comic-plane-y">
            <g className="comic-plane" transform="translate(-14 -9)">
              <path d="M2 10 L22 7 Q30 6 31 9 Q30 12 22 12 L2 11 Z" />
              <path d="M12 9 L7 1 L11 1 L19 9 Z" />
              <path d="M12 11 L7 18 L11 18 L19 11 Z" />
              <path d="M3 10 L1 5 L4 5 L7 10 Z" />
            </g>
          </g>
        </g>
      </svg>

      <p className="comic-caption">A travel book</p>
      <Heading className="comic-title">{title}</Heading>
      <div className="comic-bottom">
        {places.length > 0 && (
          <ul className="comic-stamps" aria-label="Destinations">
            {places.slice(0, 3).map((place, i) => (
              <li
                key={place}
                style={
                  {
                    '--tilt': `${STAMP_TILTS[i % STAMP_TILTS.length]}deg`,
                    '--stamp': STAMP_INKS[i % STAMP_INKS.length],
                  } as CSSProperties
                }
              >
                {place}
              </li>
            ))}
          </ul>
        )}
        <p className="comic-dates">{dates}</p>
      </div>
    </div>
  );
}

/** The back of the book: the same panel, signing off. */
export function ComicBackCover({ colour }: { colour: string }) {
  return (
    <div
      className="comic-cover back"
      data-animate="always"
      style={{ '--cover': colour } as CSSProperties}
    >
      <span className="comic-rays" aria-hidden="true" />
      <span className="comic-halftone" aria-hidden="true" />
      <p className="comic-the-end">The end!</p>
    </div>
  );
}
