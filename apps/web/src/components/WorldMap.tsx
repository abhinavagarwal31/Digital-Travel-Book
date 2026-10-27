import type { TripPath } from '@tb/shared';
import { geoGraticule10, geoNaturalEarth1, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import type { Feature } from 'geojson';
import { feature, neighbors } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countriesTopology from 'world-atlas/countries-110m.json';
import { colourCountries, routeCurve, visitedCountries } from '../lib/worldMap.ts';

// ---------- The world, prepared once ----------

const WIDTH = 960;
const HEIGHT = 500;
/** How thick the map's board looks, seen from slightly above. */
const DEPTH = 14;

const topology = countriesTopology as unknown as Topology<{
  countries: GeometryCollection<{ name: string }>;
}>;
const COUNTRIES = feature(topology, topology.objects.countries).features as Feature[];
const NAMES = COUNTRIES.map((c) => (c.properties as { name?: string } | null)?.name ?? '');

/** Atlas colours: soft, sunny, and distinct from their neighbours. */
const PALETTE = ['#f7c873', '#f4a28c', '#b5d98a', '#c9a8e3', '#f6e27f', '#93d5c9', '#f5b3cf'];
const COLOURS = colourCountries(neighbors(topology.objects.countries.geometries), PALETTE.length);

const projection = geoNaturalEarth1().fitExtent(
  [
    [8, 8],
    [WIDTH - 8, HEIGHT - 8],
  ],
  { type: 'Sphere' },
);
const path = geoPath(projection);
const SPHERE = path({ type: 'Sphere' }) ?? '';
const GRATICULE = path(geoGraticule10()) ?? '';
const COUNTRY_PATHS = COUNTRIES.map((c) => path(c) ?? '');

const OCEANS: { name: string; at: [number, number] }[] = [
  { name: 'North Pacific Ocean', at: [-150, 28] },
  { name: 'South Pacific Ocean', at: [-128, -28] },
  { name: 'North Atlantic Ocean', at: [-42, 32] },
  { name: 'South Atlantic Ocean', at: [-16, -28] },
  { name: 'Indian Ocean', at: [80, -22] },
  { name: 'Arctic Ocean', at: [10, 82] },
  { name: 'Southern Ocean', at: [60, -60] },
];

/** A colour per trip for its pins and routes, bold enough over pastel land. */
const TRIP_COLOURS = ['#e5484d', '#0f8f88', '#7c3aed', '#e8590c', '#2563eb', '#c2255c'];

const at = (p: { lat: number; lng: number }) =>
  (projection([p.lng, p.lat]) ?? [0, 0]) as [number, number];

/** A cartoon map pin, its point at (0, 0). */
const PIN = 'M0 0 C -4 -6 -8 -9.5 -8 -14 A 8 8 0 1 1 8 -14 C 8 -9.5 4 -6 0 0 Z';

/**
 * The world as a colourful atlas map, the centrepiece of the library: every
 * country in its own soft colour with an ink outline, the oceans named, and
 * on top the trips: a pin at each place, joined by curved routes that draw
 * themselves in. Countries visited are outlined boldly and named.
 */
export default function WorldMap({ trips }: { trips: TripPath[] }) {
  const places = trips.flatMap((t) => t.points);
  const visited = visitedCountries(COUNTRIES as GeoPermissibleObjects[], places);
  const ordered = [...trips].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const count = places.length;

  return (
    <svg
      className="world-map"
      viewBox={`0 0 ${WIDTH} ${HEIGHT + DEPTH + 10}`}
      role="img"
      aria-label={
        count === 0
          ? 'A map of the world, waiting for your first trip'
          : `A map of the world with ${count} ${count === 1 ? 'place' : 'places'} from ${trips.length} ${trips.length === 1 ? 'trip' : 'trips'}${visited.size ? `, in ${[...visited].map((i) => NAMES[i]).join(', ')}` : ''}`
      }
    >
      <defs>
        <radialGradient id="wm-ocean" cx="45%" cy="40%" r="70%">
          <stop offset="0" stopColor="#bfeaff" />
          <stop offset="0.55" stopColor="#7fcdf2" />
          <stop offset="1" stopColor="#3d9bd6" />
        </radialGradient>
        <linearGradient id="wm-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f5f8f" />
          <stop offset="1" stopColor="#0d2f4c" />
        </linearGradient>
        <radialGradient id="wm-shine" cx="35%" cy="25%" r="60%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <clipPath id="wm-sphere">
          <path d={SPHERE} />
        </clipPath>
        <filter id="wm-shadow" x="-10%" y="-10%" width="120%" height="140%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* The board: a soft shadow on the page, then its thick edge. */}
      <ellipse
        cx={WIDTH / 2}
        cy={HEIGHT + DEPTH - 2}
        rx={WIDTH * 0.42}
        ry={16}
        fill="rgb(20 30 50 / 0.35)"
        filter="url(#wm-shadow)"
      />
      <path d={SPHERE} transform={`translate(0 ${DEPTH})`} fill="url(#wm-edge)" />

      <path d={SPHERE} fill="url(#wm-ocean)" />
      <g clipPath="url(#wm-sphere)">
        <path d={GRATICULE} fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="0.6" />
        {OCEANS.map((o) => {
          const [x, y] = at({ lng: o.at[0], lat: o.at[1] });
          return (
            <text key={o.name} x={x} y={y} className="wm-ocean">
              {o.name}
            </text>
          );
        })}
        {COUNTRY_PATHS.map((d, i) => (
          <path
            key={i}
            d={d}
            className={visited.has(i) ? 'wm-country visited' : 'wm-country'}
            fill={PALETTE[COLOURS[i] ?? 0]}
          >
            <title>{NAMES[i]}</title>
          </path>
        ))}
        <path d={SPHERE} fill="url(#wm-shine)" pointerEvents="none" />
      </g>
      <path d={SPHERE} fill="none" stroke="#173b5c" strokeWidth="2.5" />

      {/* Journeys: trip to trip in date order, then each trip's own route. */}
      {ordered.slice(1).map((trip, i) => {
        const from = ordered[i]?.points.at(-1);
        const to = trip.points[0];
        return from && to ? (
          <path
            key={`between-${trip.bookId}`}
            d={routeCurve(at(from), at(to))}
            className="wm-route between"
            pathLength={1}
          />
        ) : null;
      })}
      {ordered.map((trip, t) => {
        const colour = TRIP_COLOURS[t % TRIP_COLOURS.length];
        return (
          <g key={trip.bookId} className="wm-trip" style={{ color: colour }}>
            <title>{trip.title}</title>
            {trip.points.slice(1).map((p, i) => {
              const d = routeCurve(at(trip.points[i] as typeof p), at(p));
              const delay = { animationDelay: `${0.3 + t * 0.4 + i * 0.12}s` };
              return (
                <g key={i}>
                  <path d={d} className="wm-route casing" pathLength={1} style={delay} />
                  <path d={d} className="wm-route" pathLength={1} style={delay} />
                </g>
              );
            })}
            {trip.points.map((p, i) => {
              const [x, y] = at(p);
              return (
                <g
                  key={i}
                  className="wm-pin"
                  transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
                  style={{ animationDelay: `${0.2 + t * 0.4 + i * 0.12}s` }}
                >
                  <path d={PIN} fill="currentColor" />
                  <circle cy={-14} r={3.2} fill="#ffffff" />
                </g>
              );
            })}
          </g>
        );
      })}
      {/* Names of countries visited, above everything so pins never hide them. */}
      {[...visited].map((i) => {
        const [x, y] = path.centroid(COUNTRIES[i] as Feature);
        return (
          <text key={i} x={x} y={y + 16} className="wm-country-name">
            {NAMES[i]}
          </text>
        );
      })}
    </svg>
  );
}
