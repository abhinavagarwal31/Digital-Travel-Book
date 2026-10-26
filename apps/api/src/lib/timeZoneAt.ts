import { find } from 'geo-tz';

/**
 * The IANA zone at a coordinate, from geo-tz's offline boundary data (no
 * network). Open sea maps to nautical zones such as "Etc/GMT+11". Where borders
 * overlap, geo-tz may return several zones; the first is used.
 */
export function timeZoneAt(lat: number, lng: number): string | null {
  try {
    return find(lat, lng)[0] ?? null;
  } catch {
    return null;
  }
}
