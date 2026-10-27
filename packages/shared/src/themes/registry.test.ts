import { describe, expect, it } from 'vitest';
import { THEME_IDS } from '../schemas/book.ts';
import { coverDesignOf, themeDefinitionSchema } from './definition.ts';
import { editorialV1 } from './editorial.v1.ts';
import { DEFAULT_THEME_ID, PRESET_THEMES, latestThemeVersion, resolveTheme } from './registry.ts';

describe('theme definitions', () => {
  it('offers every preset theme, each valid', () => {
    expect(PRESET_THEMES.map((t) => t.id)).toEqual([...THEME_IDS]);
    for (const t of PRESET_THEMES) expect(themeDefinitionSchema.parse(t.definition)).toBeTruthy();
  });

  it('accepts only hex colours, listed fonts and an allowed default layout', () => {
    const broken = (change: object) =>
      themeDefinitionSchema.safeParse({ ...editorialV1, ...change }).success;
    expect(broken({})).toBe(true);
    expect(broken({ colors: { ...editorialV1.colors, ink: 'red' } })).toBe(false);
    expect(broken({ colors: { ...editorialV1.colors, ink: 'url(x)' } })).toBe(false);
    expect(broken({ fonts: { ...editorialV1.fonts, body: 'comic-sans' } })).toBe(false);
    expect(broken({ photos: { ...editorialV1.photos, defaultLayout: 'grid-4' } })).toBe(false);
    expect(broken({ css: 'body { display: none }' })).toBe(false);
  });
});

describe('covers', () => {
  it('gives only the comic theme a comic cover, and every other one a traveller’s cover', () => {
    const designs = Object.fromEntries(
      PRESET_THEMES.map((t) => [t.id, coverDesignOf(t.definition)]),
    );
    expect(designs).toEqual({
      traveller: 'journal',
      atlas: 'atlas',
      editorial: 'cloth',
      scrapbook: 'luggage',
      comic: 'comic',
      postcard: 'airmail',
      midnight: 'passport',
      pastel: 'cloth',
      latte: 'cloth',
      espresso: 'journal',
    });
  });

  it('keeps versions released before cover designs on the cover that suits their look', () => {
    expect(coverDesignOf(resolveTheme({ id: 'comic', version: 1 }).definition)).toBe('comic');
    expect(coverDesignOf(resolveTheme({ id: 'postcard', version: 1 }).definition)).toBe('cloth');
  });

  it('starts new books in a quiet, non-comic theme', () => {
    expect(DEFAULT_THEME_ID).toBe('traveller');
  });
});

describe('resolveTheme', () => {
  it('renders exactly the pinned version', () => {
    const t = resolveTheme({ id: 'scrapbook', version: 1 });
    expect(t).toMatchObject({ id: 'scrapbook', version: 1, notice: null });
    expect(t.definition.name).toBe('Scrapbook');
  });

  it('falls back to the latest version of the same theme, and says so', () => {
    const t = resolveTheme({ id: 'atlas', version: 99 });
    expect(t).toMatchObject({ id: 'atlas', version: latestThemeVersion('atlas') });
    expect(t.notice).toMatch(/Illustrated Atlas, version 99.*latest version/);
    expect(resolveTheme({ id: 'atlas', version: 0 }).notice).not.toBeNull();
    expect(resolveTheme({ id: 'atlas', version: 1.5 }).notice).not.toBeNull();
  });

  it('falls back to the default theme for an unknown one, and says so', () => {
    const t = resolveTheme({ id: 'vaporwave', version: 1 });
    expect(t.id).toBe(DEFAULT_THEME_ID);
    expect(t.notice).toMatch(/no longer available, so Traveller’s Journal is shown/);
  });
});
