import { z } from 'zod';

/**
 * A theme is data, never code: colours as hex values and every other choice
 * from a fixed list. The same schema validates the presets and, later, any
 * theme a user generates, so the renderer can trust whatever it is given.
 */

/** Self-hosted fonts the reader can load; a theme picks from these only. */
export const THEME_FONTS = [
  'fraunces',
  'playfair',
  'inter',
  'caveat',
  'bangers',
  'comic-neue',
  'special-elite',
] as const;
export const MAP_TILE_STYLES = [
  'stamen_watercolor',
  'stamen_toner_lite',
  'alidade_smooth',
  'alidade_smooth_dark',
] as const;
/** How photos sit on the page: bare, mounted with a border, as polaroids, or as inked comic panels. */
export const PHOTO_FRAMES = [
  'plain',
  'mounted',
  'polaroid',
  'panel',
  'postcard',
  'gilded',
  'rounded',
] as const;
/**
 * The book's whole make: a classic bound book, or a comic (newsprint, inked
 * panels, lettered captions, a soft binding). Absent means classic, so themes
 * released before this existed render exactly as they did.
 */
export const PAGE_LOOKS = ['classic', 'comic'] as const;
/** Photo page layouts, named by how many photos they hold. */
export const PHOTO_LAYOUTS = ['hero-1', 'split-2', 'mosaic-3', 'grid-4'] as const;

export type ThemeFont = (typeof THEME_FONTS)[number];
export type MapTileStyle = (typeof MAP_TILE_STYLES)[number];
export type PhotoFrame = (typeof PHOTO_FRAMES)[number];
export type PhotoLayout = (typeof PHOTO_LAYOUTS)[number];
export type PageLook = (typeof PAGE_LOOKS)[number];

/** Photos on a page in each layout. */
export const LAYOUT_CAPACITY: Record<PhotoLayout, number> = {
  'hero-1': 1,
  'split-2': 2,
  'mosaic-3': 3,
  'grid-4': 4,
};

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, 'Colours are six-digit hex values');

export const themeDefinitionSchema = z
  .strictObject({
    /** The shape of this object; bumped only with an upgrade function for older ones. */
    format: z.literal(1),
    name: z.string().trim().min(1).max(40),
    look: z.enum(PAGE_LOOKS).optional(),
    description: z.string().trim().max(160),
    fonts: z.strictObject({
      display: z.enum(THEME_FONTS),
      body: z.enum(THEME_FONTS),
      caption: z.enum(THEME_FONTS),
    }),
    colors: z.strictObject({
      paper: hex,
      ink: hex,
      muted: hex,
      accent: hex,
      /** Null: each book gets its own cloth colour. */
      cover: hex.nullable(),
      coverInk: hex,
    }),
    map: z.strictObject({ tiles: z.enum(MAP_TILE_STYLES), pin: hex, line: hex }),
    photos: z.strictObject({
      frame: z.enum(PHOTO_FRAMES),
      layouts: z.array(z.enum(PHOTO_LAYOUTS)).min(1),
      defaultLayout: z.enum(PHOTO_LAYOUTS),
    }),
  })
  .refine((t) => t.photos.layouts.includes(t.photos.defaultLayout), {
    path: ['photos', 'defaultLayout'],
    message: 'The default layout must be one the theme allows',
  });

export type ThemeDefinition = z.infer<typeof themeDefinitionSchema>;
