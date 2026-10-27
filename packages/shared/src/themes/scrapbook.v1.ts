import type { ThemeDefinition } from './definition.ts';

// Released: never edit. A visual change ships as scrapbook.v2.ts.
export const scrapbookV1: ThemeDefinition = {
  format: 1,
  name: 'Scrapbook',
  description:
    'Polaroids taped onto kraft paper with handwritten notes, like a trip pasted up by hand.',
  fonts: { display: 'caveat', body: 'fraunces', caption: 'caveat' },
  colors: {
    paper: '#efe4cc',
    ink: '#3a2e22',
    muted: '#8a7458',
    accent: '#c8463d',
    cover: '#a8814f',
    coverInk: '#fff6e4',
  },
  map: { tiles: 'stamen_toner_lite', pin: '#c8463d', line: '#3a2e22' },
  photos: {
    frame: 'polaroid',
    layouts: ['hero-1', 'split-2', 'mosaic-3'],
    defaultLayout: 'split-2',
  },
};
