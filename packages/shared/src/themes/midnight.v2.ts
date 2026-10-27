import type { ThemeDefinition } from './definition.ts';
import { midnightV1 } from './midnight.v1.ts';

// Released: never edit. Version 1 bound as a navy passport in gold foil.
export const midnightV2: ThemeDefinition = {
  ...midnightV1,
  coverDesign: 'passport',
  colors: { ...midnightV1.colors, cover: '#1c2541' },
};
