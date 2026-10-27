import { THEME_IDS, type ThemeId } from '../schemas/book.ts';
import { atlasV1 } from './atlas.v1.ts';
import { atlasV2 } from './atlas.v2.ts';
import { comicV1 } from './comic.v1.ts';
import { themeDefinitionSchema, type ThemeDefinition } from './definition.ts';
import { editorialV1 } from './editorial.v1.ts';
import { espressoV1 } from './espresso.v1.ts';
import { latteV1 } from './latte.v1.ts';
import { midnightV1 } from './midnight.v1.ts';
import { midnightV2 } from './midnight.v2.ts';
import { pastelV1 } from './pastel.v1.ts';
import { postcardV1 } from './postcard.v1.ts';
import { postcardV2 } from './postcard.v2.ts';
import { scrapbookV1 } from './scrapbook.v1.ts';
import { scrapbookV2 } from './scrapbook.v2.ts';
import { travellerV1 } from './traveller.v1.ts';

/**
 * Every released version of every preset, oldest first. Versions are only ever
 * added: a book keeps rendering exactly as it did until its owner re-selects
 * its theme. Each definition is validated when the module loads, so a broken
 * theme fails every test rather than one reader's book.
 */
const PRESETS: Record<ThemeId, readonly ThemeDefinition[]> = {
  traveller: [travellerV1],
  atlas: [atlasV1, atlasV2],
  editorial: [editorialV1],
  scrapbook: [scrapbookV1, scrapbookV2],
  comic: [comicV1],
  postcard: [postcardV1, postcardV2],
  midnight: [midnightV1, midnightV2],
  pastel: [pastelV1],
  latte: [latteV1],
  espresso: [espressoV1],
};
for (const versions of Object.values(PRESETS)) {
  for (const definition of versions) themeDefinitionSchema.parse(definition);
}

/** New books start here: a plain leather journal, quiet enough for any trip. */
export const DEFAULT_THEME_ID: ThemeId = 'traveller';

export const latestThemeVersion = (id: ThemeId) => PRESETS[id].length;

/** The newest version of each preset, for choosing a theme. */
export const PRESET_THEMES = THEME_IDS.map((id) => ({
  id,
  version: latestThemeVersion(id),
  definition: PRESETS[id][latestThemeVersion(id) - 1] as ThemeDefinition,
}));

export interface ResolvedTheme {
  id: ThemeId;
  version: number;
  definition: ThemeDefinition;
  /** Set when the book could not get exactly the theme it asked for. */
  notice: string | null;
}

/**
 * The definition a book renders with. Exactly the pinned version when it is
 * registered; otherwise the latest version of the same theme, and for an
 * unknown theme the default one, each with a notice for the owner.
 */
export function resolveTheme(ref: { id: string; version: number }): ResolvedTheme {
  const known = (THEME_IDS as readonly string[]).includes(ref.id);
  const id = known ? (ref.id as ThemeId) : DEFAULT_THEME_ID;
  const versions = PRESETS[id];
  const pinned = known && Number.isInteger(ref.version) ? versions[ref.version - 1] : undefined;
  if (pinned) return { id, version: ref.version, definition: pinned, notice: null };

  const version = versions.length;
  const definition = versions[version - 1] as ThemeDefinition;
  return {
    id,
    version,
    definition,
    notice: known
      ? `This book's style (${definition.name}, version ${ref.version}) is no longer available, so the latest version is shown.`
      : `This book's style is no longer available, so ${definition.name} is shown.`,
  };
}
