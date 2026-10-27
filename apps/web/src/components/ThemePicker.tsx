import { PRESET_THEMES, resolveTheme, type Book, type ThemeId } from '@tb/shared';
import { useState } from 'react';
import { useSetTheme } from '../lib/books.ts';
import { themeStyle } from '../lib/theme.ts';

/**
 * The three book styles as cards, each a tiny page drawn with the theme's own
 * colours, fonts and photo frame. A native radio group: arrow keys move
 * between styles and choosing one saves it straight away.
 */
export function ThemePicker({ book }: { book: Book }) {
  const setTheme = useSetTheme(book.id);
  const current = resolveTheme(book.theme);
  // A choice shows at once, while it saves; if saving fails it goes back.
  const [picked, setPicked] = useState<ThemeId | null>(null);
  const chosen = picked ?? current.id;

  return (
    <section className="stack" aria-labelledby="style-heading">
      <div className="page-title">
        <h2 id="style-heading">Book style</h2>
        <span className="muted" aria-live="polite">
          {setTheme.isPending ? 'Saving…' : ''}
        </span>
      </div>
      {current.notice && <p className="notice">{current.notice}</p>}
      <fieldset className="theme-picker">
        <legend className="visually-hidden">Book style</legend>
        {PRESET_THEMES.map(({ id, definition: t }) => (
          <label key={id} className="theme-card" data-chosen={chosen === id}>
            <input
              type="radio"
              name="theme"
              value={id}
              checked={chosen === id}
              disabled={setTheme.isPending}
              onChange={() => {
                setPicked(id);
                setTheme.mutate(id, { onSettled: () => setPicked(null) });
              }}
            />
            <span
              className="theme-preview"
              style={themeStyle(t)}
              data-frame={t.photos.frame}
              data-look={t.look ?? 'classic'}
              aria-hidden="true"
            >
              <span className="theme-preview-eyebrow">Day 3</span>
              <span className="theme-preview-title">Kyoto</span>
              <span className="theme-preview-photo" />
              <span className="theme-preview-caption">Lanterns at dusk</span>
            </span>
            <span className="theme-card-text">
              <strong>{t.name}</strong>
              <span className="muted">{t.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {setTheme.isError && (
        <p role="alert" className="form-error">
          Could not change the style. Try again.
        </p>
      )}
    </section>
  );
}
