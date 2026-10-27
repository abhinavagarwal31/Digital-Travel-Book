import type { ThemeDefinition } from './definition.ts';

// Released: never edit. A visual change ships as pastel.v2.ts.
export const pastelV1: ThemeDefinition = {
  format: 1,
  name: 'Pastel Breeze',
  description: 'Soft blush pages and rounded photos with gentle shadows: light and airy.',
  fonts: { display: 'fraunces', body: 'inter', caption: 'inter' },
  colors: {
    paper: '#fdf1ee',
    ink: '#3d3a4b',
    muted: '#8c86a0',
    accent: '#d9688c',
    cover: null,
    coverInk: '#ffffff',
  },
  map: { tiles: 'alidade_smooth', pin: '#d9688c', line: '#7a6fa6' },
  photos: {
    frame: 'rounded',
    layouts: ['hero-1', 'split-2', 'mosaic-3', 'grid-4'],
    defaultLayout: 'mosaic-3',
  },
};
