import type { ThemeDefinition } from './definition.ts';

// Released: never edit. A visual change ships as midnight.v2.ts.
export const midnightV1: ThemeDefinition = {
  format: 1,
  name: 'Midnight',
  description: 'Deep navy pages, gold accents and night maps: a book for the evening.',
  fonts: { display: 'playfair', body: 'fraunces', caption: 'playfair' },
  colors: {
    paper: '#161a2c',
    ink: '#f1e9d8',
    muted: '#9aa0b8',
    accent: '#e2b75e',
    cover: null,
    coverInk: '#f6e7c1',
  },
  map: { tiles: 'alidade_smooth_dark', pin: '#e2b75e', line: '#f1e9d8' },
  photos: {
    frame: 'gilded',
    layouts: ['hero-1', 'split-2', 'mosaic-3', 'grid-4'],
    defaultLayout: 'mosaic-3',
  },
};
