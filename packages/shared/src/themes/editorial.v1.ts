import type { ThemeDefinition } from './definition.ts';

// Released: never edit. A visual change ships as editorial.v2.ts.
export const editorialV1: ThemeDefinition = {
  format: 1,
  name: 'Minimal Editorial',
  description:
    'Crisp white pages, high-contrast type and full-bleed photos, like a magazine feature.',
  fonts: { display: 'playfair', body: 'inter', caption: 'playfair' },
  colors: {
    paper: '#fbfaf7',
    ink: '#16140f',
    muted: '#7d776c',
    accent: '#b23a2a',
    cover: '#1c1b19',
    coverInk: '#f4efe6',
  },
  map: { tiles: 'alidade_smooth', pin: '#b23a2a', line: '#16140f' },
  photos: { frame: 'plain', layouts: ['hero-1', 'split-2', 'mosaic-3'], defaultLayout: 'mosaic-3' },
};
