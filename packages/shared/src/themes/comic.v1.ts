import type { ThemeDefinition } from './definition.ts';

// Released: never edit. A visual change ships as comic.v2.ts.
export const comicV1: ThemeDefinition = {
  format: 1,
  name: 'Comic Adventure',
  look: 'comic',
  description:
    'Inked panels on newsprint, narration boxes and bold lettering: your trip as a comic.',
  fonts: { display: 'bangers', body: 'comic-neue', caption: 'comic-neue' },
  colors: {
    paper: '#fff8e8',
    ink: '#16120e',
    muted: '#5f554a',
    accent: '#e63946',
    cover: null,
    coverInk: '#fffdf6',
  },
  map: { tiles: 'stamen_toner_lite', pin: '#e63946', line: '#16120e' },
  photos: {
    frame: 'panel',
    layouts: ['hero-1', 'split-2', 'mosaic-3', 'grid-4'],
    defaultLayout: 'mosaic-3',
  },
};
