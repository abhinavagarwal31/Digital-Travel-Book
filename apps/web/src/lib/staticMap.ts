import type { LatLng, ThemeId } from '@tb/shared';

/**
 * Static maps drawn from plain map tiles and SVG, with no map library. The
 * book's pages flip in 3D, and a fixed picture behaves there like any image:
 * it scales with the page and never needs resizing when a page comes into view.
 */

export const TILE_SIZE = 256;
export const MAX_ZOOM = 15;
/** One place alone: close enough to see the neighbourhood around it. */
export const SINGLE_PIN_ZOOM = 13;

interface TileStyle {
  path: string;
  ext: 'jpg' | 'png';
  attribution: string;
}

const OSM = '© OpenMapTiles © OpenStreetMap';

/** Each theme's tiles, all from Stadia Maps (free for localhost; a registered domain in production). */
export const MAP_STYLES: Record<ThemeId, TileStyle> = {
  atlas: {
    path: 'stamen_watercolor',
    ext: 'jpg',
    attribution: `© Stadia Maps © Stamen Design ${OSM}`,
  },
  scrapbook: {
    path: 'stamen_toner_lite',
    ext: 'png',
    attribution: `© Stadia Maps © Stamen Design ${OSM}`,
  },
  editorial: { path: 'alidade_smooth', ext: 'png', attribution: `© Stadia Maps ${OSM}` },
};

export const tileUrl = (style: TileStyle, z: number, x: number, y: number) =>
  `https://tiles.stadiamaps.com/tiles/${style.path}/${z}/${x}/${y}@2x.${style.ext}`;

/** Web Mercator: a position in pixels on the whole world drawn at `zoom`. */
export function project({ lat, lng }: LatLng, zoom: number): { x: number; y: number } {
  const size = TILE_SIZE * 2 ** zoom;
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

/**
 * Longitudes rewritten so the points sit together: a trip across the date
 * line (Tokyo to Honolulu) is drawn across the Pacific, not around the world.
 */
export function unwrapLongitudes(points: LatLng[]): LatLng[] {
  const lngs = points.map((p) => p.lng);
  if (lngs.length === 0 || Math.max(...lngs) - Math.min(...lngs) <= 180) return points;
  return points.map((p) => (p.lng < 0 ? { ...p, lng: p.lng + 360 } : p));
}

export interface MapTile {
  key: string;
  url: string;
  /** Top-left corner in map coordinates (0…width, 0…height). */
  left: number;
  top: number;
}

export interface MapView {
  zoom: number;
  width: number;
  height: number;
  tiles: MapTile[];
  /** Where each input point lands on the map, in the same order. */
  points: { x: number; y: number }[];
}

/**
 * The closest view (up to `MAX_ZOOM`) that shows every point at least
 * `padding` from the edges, the tiles covering it, and where the points land.
 */
export function fitMap(
  input: LatLng[],
  width: number,
  height: number,
  style: TileStyle,
  padding = 48,
): MapView {
  const points = unwrapLongitudes(input);
  const span = (zoom: number) => {
    const xy = points.map((p) => project(p, zoom));
    const xs = xy.map((p) => p.x);
    const ys = xy.map((p) => p.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  };

  let zoom = points.length <= 1 ? SINGLE_PIN_ZOOM : MAX_ZOOM;
  if (points.length > 1) {
    for (; zoom > 0; zoom--) {
      const s = span(zoom);
      if (s.maxX - s.minX <= width - 2 * padding && s.maxY - s.minY <= height - 2 * padding) break;
    }
  }

  const s = points.length > 0 ? span(zoom) : { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  const left = (s.minX + s.maxX) / 2 - width / 2;
  const top = (s.minY + s.maxY) / 2 - height / 2;
  const count = 2 ** zoom;

  const tiles: MapTile[] = [];
  for (let ty = Math.floor(top / TILE_SIZE); ty * TILE_SIZE < top + height; ty++) {
    if (ty < 0 || ty >= count) continue; // beyond the poles: plain background
    for (let tx = Math.floor(left / TILE_SIZE); tx * TILE_SIZE < left + width; tx++) {
      const x = ((tx % count) + count) % count; // the world repeats east and west
      tiles.push({
        key: `${zoom}/${tx}/${ty}`,
        url: tileUrl(style, zoom, x, ty),
        left: tx * TILE_SIZE - left,
        top: ty * TILE_SIZE - top,
      });
    }
  }

  return {
    zoom,
    width,
    height,
    tiles,
    points: points.map((p) => {
      const xy = project(p, zoom);
      return { x: xy.x - left, y: xy.y - top };
    }),
  };
}
