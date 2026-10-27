import type { ThemeDefinition } from './definition.ts';

// Released: never edit. A visual change ships as atlas.v2.ts.
export const atlasV1: ThemeDefinition = {
  format: 1,
  name: 'Illustrated Atlas',
  description: 'Watercolour maps, warm parchment and mounted photos, like an explorer’s journal.',
  fonts: { display: 'fraunces', body: 'fraunces', caption: 'fraunces' },
  colors: {
    paper: '#f6eedd',
    ink: '#2f2a22',
    muted: '#857660',
    accent: '#2f6b6a',
    cover: null,
    coverInk: '#f6ead6',
  },
  map: { tiles: 'stamen_watercolor', pin: '#9c3d22', line: '#7a2f1a' },
  photos: {
    frame: 'mounted',
    layouts: ['hero-1', 'split-2', 'mosaic-3', 'grid-4'],
    defaultLayout: 'grid-4',
  },
};
