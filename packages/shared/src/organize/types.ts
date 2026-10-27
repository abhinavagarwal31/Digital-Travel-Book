import type { PhotoFlag } from '../schemas/photo.ts';
import type { LatLng } from './geo.ts';

/** The photo fields organisation reads. The API's Photo fits this shape. */
export interface OrganizablePhoto {
  id: string;
  status: string;
  hidden: boolean;
  /** Absolute capture time (ISO), or null when unknown. */
  capturedAt: string | null;
  localDateTime: string | null;
  gps: LatLng | null;
  gpsStatus: 'exif' | 'confirmed' | 'removed' | null;
  dayDate: string | null;
  assignedBy: 'auto' | 'user';
  flags: PhotoFlag[];
}

export interface Chapter {
  /** Stable id: survives renames and reordering. */
  id: string;
  title: string;
  /** The chapter's days in reading order. A day belongs to at most one chapter. */
  dayDates: string[];
}

/** Every threshold is a named, adjustable value, not a fact. */
export interface OrganizeConfig {
  /** Faster than any airliner: a jump implying more than this is suspicious. */
  maxKmh: number;
  /** Jumps shorter than this are GPS jitter, never outliers. */
  minJumpKm: number;
  /** A photo within this distance of a stop's centre can join it… */
  stopRadiusM: number;
  /** …if taken within this many minutes of the stop's last photo. */
  stopGapMin: number;
  /** Consecutive days whose centres are this close share a suggested chapter. */
  chapterMergeKm: number;
}

export const DEFAULT_ORGANIZE_CONFIG: OrganizeConfig = {
  maxKmh: 1000,
  minJumpKm: 20,
  stopRadiusM: 750,
  stopGapMin: 120,
  chapterMergeKm: 40,
};
