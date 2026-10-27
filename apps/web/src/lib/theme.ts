import type { ThemeDefinition, ThemeFont } from '@tb/shared';
import type { CSSProperties } from 'react';

/** Each allowed font, as a CSS stack. All are self-hosted (see main.tsx). */
export const FONT_STACKS: Record<ThemeFont, string> = {
  fraunces: "'Fraunces Variable', 'Iowan Old Style', Georgia, serif",
  playfair: "'Playfair Display Variable', Georgia, serif",
  inter: "'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif",
  caveat: "'Caveat Variable', 'Bradley Hand', cursive",
  bangers: "'Bangers', Impact, 'Arial Black', sans-serif",
  'comic-neue': "'Comic Neue', 'Comic Sans MS', 'Chalkboard SE', sans-serif",
};

/**
 * A theme as the CSS variables the reader's styles read. Components never
 * check which theme is in use: everything visual comes from these values
 * plus the `data-frame` attribute.
 */
export function themeStyle(theme: ThemeDefinition): CSSProperties {
  return {
    '--paper-page': theme.colors.paper,
    '--paper-ink': theme.colors.ink,
    '--paper-muted': theme.colors.muted,
    '--paper-accent': theme.colors.accent,
    '--cover-ink': theme.colors.coverInk,
    '--map-pin': theme.map.pin,
    '--map-line': theme.map.line,
    '--font-display': FONT_STACKS[theme.fonts.display],
    '--font-body': FONT_STACKS[theme.fonts.body],
    '--font-caption': FONT_STACKS[theme.fonts.caption],
  } as CSSProperties;
}
