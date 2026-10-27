import type { ThemeDefinition } from './definition.ts';
import { atlasV1 } from './atlas.v1.ts';

// Released: never edit. Version 1 with a cover of its own: an old atlas, a compass rose and a title cartouche.
export const atlasV2: ThemeDefinition = { ...atlasV1, coverDesign: 'atlas' };
