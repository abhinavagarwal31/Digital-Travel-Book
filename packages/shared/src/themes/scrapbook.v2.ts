import type { ThemeDefinition } from './definition.ts';
import { scrapbookV1 } from './scrapbook.v1.ts';

// Released: never edit. Version 1 with a cover of its own: kraft board with a luggage tag and travel stickers.
export const scrapbookV2: ThemeDefinition = { ...scrapbookV1, coverDesign: 'luggage' };
