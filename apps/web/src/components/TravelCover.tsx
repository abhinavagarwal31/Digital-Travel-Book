import type { CoverDesign } from '@tb/shared';
import type { CSSProperties } from 'react';

type TravelDesign = Exclude<CoverDesign, 'comic'>;

interface TravelCoverProps {
  design: TravelDesign;
  title: string;
  dates: string;
  places: string[];
  /** A photo the owner chose for the cover, set into the design. */
  photoUrl?: string | null;
  /** On a shelf a cover only moves while it is pointed at. */
  animate?: 'always' | 'hover';
  /** h1 on the book itself, h2 on a shelf, none in a preview. */
  headingLevel?: 1 | 2 | null;
}

/** Long titles get smaller lettering so they still fit. */
export function travelTitleSize(title: string): number {
  const n = title.length;
  if (n <= 12) return 12;
  if (n <= 20) return 10;
  if (n <= 32) return 8;
  return 6.5;
}

const STICKER_TILTS = [-12, 9, -4];
const STICKER_INKS = ['#c8463d', '#2f6b6a', '#d98e2b'];

/**
 * A travel book's cover made as something a traveller carries: a cloth
 * board, a stitched leather journal, an old atlas, a passport, an airmail
 * envelope, or a kraft board with a luggage tag. It fills its box and sizes
 * everything in cqw, so one design serves the shelf, the book and a preview.
 * Every word on it is the owner's own data.
 */
export function TravelCover({
  design,
  title,
  dates,
  places,
  photoUrl,
  animate = 'always',
  headingLevel = 1,
}: TravelCoverProps) {
  const Heading = headingLevel === 1 ? 'h1' : headingLevel === 2 ? 'h2' : 'p';
  const style = { '--title-size': `${travelTitleSize(title)}cqw` } as CSSProperties;
  const heading = <Heading className="tc-title">{title}</Heading>;
  const photo = photoUrl ? (
    <img className="tc-photo" src={photoUrl} alt="" draggable={false} />
  ) : null;

  return (
    <div
      className={`travel-cover${photoUrl ? ' with-photo' : ''}`}
      data-design={design}
      data-animate={animate}
      style={style}
    >
      {design === 'cloth' && (
        <>
          <span className="tc-frame" aria-hidden="true" />
          <p className="tc-eyebrow">A travel book</p>
          {photo ? <span className="tc-plate">{photo}</span> : <Compass className="tc-emblem" />}
          {heading}
          <span className="tc-rule" aria-hidden="true" />
          <p className="tc-dates">{dates}</p>
          {places.length > 0 && <p className="tc-places">{places.slice(0, 4).join(' · ')}</p>}
        </>
      )}

      {design === 'journal' && (
        <>
          <span className="tc-stitch" aria-hidden="true" />
          {photo && <span className="tc-polaroid">{photo}</span>}
          <div className="tc-label">
            <p className="tc-eyebrow">Traveller’s journal</p>
            {heading}
            <p className="tc-dates">{dates}</p>
          </div>
          {places.length > 0 && <p className="tc-places">{places.slice(0, 4).join(' · ')}</p>}
          <Compass className="tc-emblem" />
          <span className="tc-band" aria-hidden="true" />
        </>
      )}

      {design === 'atlas' && (
        <>
          <Graticule />
          <Compass className="tc-rose" />
          {photo && <span className="tc-medallion">{photo}</span>}
          <div className="tc-cartouche">
            <p className="tc-eyebrow">An atlas of</p>
            {heading}
            <p className="tc-dates">{dates}</p>
          </div>
          {places.length > 0 && <p className="tc-places">{places.slice(0, 4).join(' · ')}</p>}
        </>
      )}

      {design === 'passport' && (
        <>
          <p className="tc-eyebrow">Travel book</p>
          {heading}
          {photo ? <span className="tc-seal">{photo}</span> : <Globe />}
          <p className="tc-dates">{dates}</p>
          {places.length > 0 && <p className="tc-places">{places.slice(0, 4).join(' · ')}</p>}
          <Chip />
        </>
      )}

      {design === 'airmail' && (
        <div className="tc-envelope">
          <p className="tc-par-avion">
            Par avion <span>By air mail</span>
          </p>
          <span className="tc-stamp" aria-hidden="true">
            {photo ?? <StampScene />}
          </span>
          <Postmark top={places[0] ?? 'Abroad'} bottom={dates.slice(-4)} />
          {heading}
          <ul className="tc-address" aria-label="Destinations">
            {places.slice(0, 3).map((place) => (
              <li key={place}>{place}</li>
            ))}
          </ul>
          <p className="tc-dates">{dates}</p>
        </div>
      )}

      {design === 'luggage' && (
        <>
          {photo && <span className="tc-taped">{photo}</span>}
          <svg className="tc-string" viewBox="0 0 100 133" aria-hidden="true">
            <path d={photoUrl ? 'M26 -2 C 30 16, 40 24, 40 41' : 'M30 -2 C 33 10, 45 14, 45 27'} />
          </svg>
          <div className="tc-tag">
            <span className="tc-eyelet" aria-hidden="true" />
            <p className="tc-eyebrow">Destination</p>
            {heading}
            <p className="tc-dates">{dates}</p>
          </div>
          {places.length > 0 && (
            <ul className="tc-stickers" aria-label="Destinations">
              {places.slice(0, 3).map((place, i) => (
                <li
                  key={place}
                  style={
                    {
                      '--tilt': `${STICKER_TILTS[i % STICKER_TILTS.length]}deg`,
                      '--sticker': STICKER_INKS[i % STICKER_INKS.length],
                    } as CSSProperties
                  }
                >
                  {place}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** The back of the book, in the same make, signing off. */
export function TravelBackCover({ design }: { design: TravelDesign }) {
  return (
    <div className="travel-cover back" data-design={design} data-animate="always">
      {design === 'journal' && <span className="tc-stitch" aria-hidden="true" />}
      {design === 'atlas' && <Graticule />}
      {design === 'airmail' ? (
        <div className="tc-envelope">
          <Postmark top="Home" bottom="again" />
          <p className="tc-farewell">Until the next journey</p>
        </div>
      ) : (
        <>
          {design === 'passport' ? <Chip /> : <Compass className="tc-emblem" />}
          <p className="tc-farewell">Until the next journey</p>
        </>
      )}
      {design === 'journal' && <span className="tc-band" aria-hidden="true" />}
    </div>
  );
}

// ---------- Drawn details ----------

/** A compass rose, pressed into the cover. */
function Compass({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="-50 -50 100 100" aria-hidden="true">
      <circle r="44" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle r="38" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.5 3" />
      <path d="M0 -40 L7 -7 L40 0 L7 7 L0 40 L-7 7 L-40 0 L-7 -7 Z" fill="currentColor" />
      <path
        d="M0 -24 L4 -4 L24 0 L4 4 L0 24 L-4 4 L-24 0 L-4 -4 Z"
        fill="currentColor"
        opacity="0.55"
        transform="rotate(45)"
      />
      <circle r="3.5" className="tc-hole" />
    </svg>
  );
}

/** Meridians and parallels, faint across an atlas board. */
function Graticule() {
  const meridians = [-60, -36, -12, 12, 36, 60];
  return (
    <svg
      className="tc-graticule"
      viewBox="0 0 100 133"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {meridians.map((x) => (
        <path key={x} d={`M${50 + x} -2 Q ${50 + x * 1.35} 66.5 ${50 + x} 135`} />
      ))}
      {[18, 40, 66.5, 93, 115].map((y) => (
        <path key={y} d={`M-2 ${y} Q 50 ${y + (y - 66.5) * 0.12} 102 ${y}`} />
      ))}
    </svg>
  );
}

/** A globe between laurels, in gold foil like a passport's crest. */
function Globe() {
  const leaves = [0, 1, 2, 3, 4];
  return (
    <svg className="tc-crest" viewBox="-60 -50 120 100" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.2">
        <circle r="30" />
        <ellipse rx="13" ry="30" />
        <line x1="0" y1="-30" x2="0" y2="30" />
        <path d="M-27 -13 Q 0 -8 27 -13 M-30 0 H 30 M-27 13 Q 0 8 27 13" />
      </g>
      {[-1, 1].map((side) => (
        <g key={side} transform={`scale(${side} 1)`} fill="currentColor">
          <path d="M-38 30 Q -50 0 -36 -30" fill="none" stroke="currentColor" strokeWidth="1.6" />
          {leaves.map((i) => (
            <ellipse
              key={i}
              cx={-44 + i * 0.6 - (i === 2 ? 1 : 0)}
              cy={22 - i * 12}
              rx="2.6"
              ry="6"
              transform={`rotate(${-30 + i * 14} ${-44 + i * 0.6} ${22 - i * 12})`}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

/** The little chip mark at the foot of a modern passport. */
function Chip() {
  return (
    <svg className="tc-chip" viewBox="0 0 40 26" aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="38"
        height="24"
        rx="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="20" cy="13" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M1 13 H15 M25 13 H39" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** A little painted scene for a stamp with no photo in it. */
function StampScene() {
  return (
    <svg viewBox="0 0 60 72" preserveAspectRatio="xMidYMid slice">
      <rect width="60" height="72" fill="#f4c27a" />
      <circle cx="40" cy="24" r="9" fill="#fff3d6" />
      <path d="M-2 56 L18 30 L30 44 L40 34 L62 58 V74 H-2 Z" fill="#2f6b6a" />
      <path d="M-2 62 Q 30 52 62 62 V74 H-2 Z" fill="#1f4e5a" />
    </svg>
  );
}

/** A round postmark struck across the stamp, with wavy cancel lines. */
function Postmark({ top, bottom }: { top: string; bottom: string }) {
  return (
    <svg className="tc-postmark" viewBox="0 0 120 60" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="90" cy="30" r="26" />
        <circle cx="90" cy="30" r="19" />
        <path d="M0 18 q 8 -5 16 0 t 16 0 t 16 0 t 16 0 M0 30 q 8 -5 16 0 t 16 0 t 16 0 t 16 0 M0 42 q 8 -5 16 0 t 16 0 t 16 0 t 16 0" />
      </g>
      <text x="90" y="28" textAnchor="middle" className="tc-postmark-place">
        {top.slice(0, 12)}
      </text>
      <text x="90" y="38" textAnchor="middle" className="tc-postmark-date">
        {bottom}
      </text>
    </svg>
  );
}
