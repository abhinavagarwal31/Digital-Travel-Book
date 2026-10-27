import type { ThemeDefinition } from './definition.ts';

// Released: never edit. A visual change ships as latte.v2.ts.
export const latteV1: ThemeDefinition = {
  format: 1,
  name: 'Café Latte',
  description: 'Coffee-beige pages, milky browns and polaroids, like notes written in a café.',
  coverDesign: 'cloth',
  fonts: { display: 'playfair', body: 'fraunces', caption: 'caveat' },
  colors: {
    paper: '#f1e6d6',
    ink: '#3b2a1f',
    muted: '#8c735c',
    accent: '#a0522d',
    cover: '#c9a882',
    coverInk: '#3b2a1f',
  },
  map: { tiles: 'stamen_toner_lite', pin: '#a0522d', line: '#3b2a1f' },
  photos: {
    frame: 'polaroid',
    layouts: ['hero-1', 'split-2', 'mosaic-3'],
    defaultLayout: 'split-2',
  },
};
