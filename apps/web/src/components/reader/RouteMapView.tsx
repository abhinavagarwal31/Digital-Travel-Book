import type { MapTileStyle, RouteMap } from '@tb/shared';
import { fitMap, MAP_STYLES } from '../../lib/staticMap.ts';

interface RouteMapViewProps {
  map: RouteMap;
  tiles: MapTileStyle;
  width: number;
  height: number;
  /** Read out instead of the picture, e.g. "Map of 4 places photographed, in order". */
  label: string;
  caption: string;
  className?: string;
}

/**
 * A map as a single scalable picture: tiles underneath, then the dashed lines
 * between places in the order they were photographed, then numbered pins.
 * Lines are straight on purpose: photos say where you were, not how you got there.
 */
export function RouteMapView({
  map,
  tiles,
  width,
  height,
  label,
  caption,
  className,
}: RouteMapViewProps) {
  const style = MAP_STYLES[tiles];
  const view = fitMap(
    [...map.pins.map((p) => p.point), ...map.segments.flatMap((s) => [s.from, s.to])],
    width,
    height,
    style,
  );
  const at = (i: number) => view.points[i] as { x: number; y: number };
  const pinCount = map.pins.length;

  return (
    <figure className={`route-map ${className ?? ''}`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <rect width={width} height={height} className="route-map-sea" />
        {view.tiles.map((t) => (
          <image
            key={t.key}
            href={t.url}
            x={t.left}
            y={t.top}
            // A hair of overlap hides the seams some browsers leave between tiles.
            width={256.5}
            height={256.5}
            preserveAspectRatio="none"
          />
        ))}
        {map.segments.map((s, i) => {
          const from = at(pinCount + 2 * i);
          const to = at(pinCount + 2 * i + 1);
          return (
            // A pale halo under the dashes keeps them readable over busy streets.
            <g key={i} className={s.faint ? 'route-segment faint' : 'route-segment'}>
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="route-halo" />
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="route-line" />
            </g>
          );
        })}
        {map.pins.map((pin, i) => (
          <g key={pin.id} className="route-pin" transform={`translate(${at(i).x} ${at(i).y})`}>
            <circle r={13} />
            <text dy="0.35em">{pin.number}</text>
          </g>
        ))}
      </svg>
      <figcaption>
        <span>{caption}</span>
        <small>{style.attribution}</small>
      </figcaption>
    </figure>
  );
}
