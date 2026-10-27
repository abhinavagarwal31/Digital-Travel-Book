import type { ThemeDefinition } from './definition.ts';
import { postcardV1 } from './postcard.v1.ts';

// Released: never edit. Version 1 with a cover of its own: an airmail envelope, stamped and postmarked.
export const postcardV2: ThemeDefinition = { ...postcardV1, coverDesign: 'airmail' };
