import type { OrganizablePhoto } from './types.ts';

export type SortingReason =
  'no_date' | 'outside_trip' | 'removed_by_you' | 'location_check' | 'no_date_but_location';

export interface SortingStatus {
  /** On a page of the book. */
  inBook: boolean;
  /** In the "left to sort" count: needs a day. */
  toSort: boolean;
  /** In the "check these" section: has a day, but its location looks wrong. */
  toCheck: boolean;
  reasons: SortingReason[];
}

const NONE: SortingStatus = { inBook: false, toSort: false, toCheck: false, reasons: [] };

/**
 * Where a photo stands on the sorting board. Missing GPS alone never needs
 * sorting (the book does not require a location); only a missing day or a
 * suspicious location asks for the user's decision. Photos still uploading
 * and excluded photos are outside the board entirely.
 */
export function sortingStatus(photo: OrganizablePhoto): SortingStatus {
  if (photo.status !== 'ready' || photo.hidden) return NONE;

  if (!photo.dayDate) {
    const reasons: SortingReason[] = [];
    if (photo.assignedBy === 'user') reasons.push('removed_by_you');
    else if (photo.flags.includes('outside_trip')) reasons.push('outside_trip');
    else if (photo.gps && photo.gpsStatus !== 'removed') reasons.push('no_date_but_location');
    else reasons.push('no_date');
    return { inBook: false, toSort: true, toCheck: false, reasons };
  }

  const suspicious = photo.flags.includes('gps_outlier') && photo.gpsStatus === 'exif';
  return {
    inBook: true,
    toSort: false,
    toCheck: suspicious,
    reasons: suspicious ? ['location_check'] : [],
  };
}

export interface SortingSummary {
  ready: number;
  inBook: number;
  toSort: number;
  toCheck: number;
  excluded: number;
  /** Nothing left to decide. */
  complete: boolean;
}

export function sortingSummary(photos: OrganizablePhoto[]): SortingSummary {
  const ready = photos.filter((p) => p.status === 'ready');
  const statuses = ready.map(sortingStatus);
  const toSort = statuses.filter((s) => s.toSort).length;
  const toCheck = statuses.filter((s) => s.toCheck).length;
  return {
    ready: ready.length,
    inBook: statuses.filter((s) => s.inBook).length,
    toSort,
    toCheck,
    excluded: ready.filter((p) => p.hidden).length,
    complete: toSort === 0 && toCheck === 0,
  };
}
