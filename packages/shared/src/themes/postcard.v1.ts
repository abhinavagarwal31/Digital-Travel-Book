import type { ThemeDefinition } from './definition.ts';

// Released: never edit. A visual change ships as postcard.v2.ts.
export const postcardV1: ThemeDefinition = {
  format: 1,
  name: 'Vintage Postcard',
  description: 'Aged paper, typewritten headings and sepia photos with postcard borders.',
  fonts: { display: 'special-elite', body: 'fraunces', caption: 'special-elite' },
  colors: {
    paper: '#f1e3c6',
    ink: '#3b2a1a',
    muted: '#86704f',
    accent: '#b5452b',
    cover: null,
    coverInk: '#fbf3e2',
  },
  map: { tiles: 'stamen_watercolor', pin: '#b5452b', line: '#3b2a1a' },
  photos: {
    frame: 'postcard',
    layouts: ['hero-1', 'split-2', 'mosaic-3', 'grid-4'],
    defaultLayout: 'split-2',
  },
};
