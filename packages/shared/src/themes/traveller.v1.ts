import type { ThemeDefinition } from './definition.ts';

// Released: never edit. A visual change ships as traveller.v2.ts.
export const travellerV1: ThemeDefinition = {
  format: 1,
  name: 'Traveller’s Journal',
  description:
    'A coffee-brown leather journal with cream pages and quiet type: simple and timeless.',
  coverDesign: 'journal',
  fonts: { display: 'fraunces', body: 'inter', caption: 'fraunces' },
  colors: {
    paper: '#f8f3e8',
    ink: '#2b2118',
    muted: '#8a7a68',
    accent: '#9a5b34',
    cover: '#6b4430',
    coverInk: '#f3e6d2',
  },
  map: { tiles: 'alidade_smooth', pin: '#9a5b34', line: '#2b2118' },
  photos: {
    frame: 'mounted',
    layouts: ['hero-1', 'split-2', 'mosaic-3', 'grid-4'],
    defaultLayout: 'mosaic-3',
  },
};
