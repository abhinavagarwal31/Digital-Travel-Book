import { THEME_IDS, type ThemeId } from '../schemas/book.ts';
import { atlasV1 } from './atlas.v1.ts';
import { comicV1 } from './comic.v1.ts';
import { themeDefinitionSchema, type ThemeDefinition } from './definition.ts';
import { editorialV1 } from './editorial.v1.ts';
import { scrapbookV1 } from './scrapbook.v1.ts';

/**
 * Every released version of every preset, oldest first. Versions are only ever
 * added: a book keeps rendering exactly as it did until its owner re-selects
 * its theme. Each definition is validated when the module loads, so a broken
 * theme fails every test rather than one reader's book.
 */
const PRESETS: Record<ThemeId, readonly ThemeDefinition[]> = {
  atlas: [atlasV1],
  editorial: [editorialV1],
  scrapbook: [scrapbookV1],
  comic: [comicV1],
};
for (const versions of Object.values(PRESETS)) {
  for (const definition of versions) themeDefinitionSchema.parse(definition);
}

export const DEFAULT_THEME_ID: ThemeId = 'editorial';

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
