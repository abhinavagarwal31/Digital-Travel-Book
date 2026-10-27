import type { ThemeDefinition } from './definition.ts';

// Released: never edit. A visual change ships as espresso.v2.ts.
export const espressoV1: ThemeDefinition = {
  format: 1,
  name: 'Espresso',
  description: 'Rich coffee-brown pages with crema-gold type, in a dark leather journal.',
  coverDesign: 'journal',
  fonts: { display: 'playfair', body: 'fraunces', caption: 'playfair' },
  colors: {
    paper: '#2a1d16',
    ink: '#f2e4cf',
    muted: '#b39a7f',
    accent: '#d9a566',
    cover: '#3b2419',
    coverInk: '#ecd3a6',
  },
  map: { tiles: 'alidade_smooth_dark', pin: '#d9a566', line: '#f2e4cf' },
  photos: {
    frame: 'gilded',
    layouts: ['hero-1', 'split-2', 'mosaic-3', 'grid-4'],
    defaultLayout: 'hero-1',
  },
};
