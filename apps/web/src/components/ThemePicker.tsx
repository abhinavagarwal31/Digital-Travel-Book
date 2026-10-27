import { PRESET_THEMES, resolveTheme, type Book, type ThemeId } from '@tb/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useSetTheme } from '../lib/books.ts';
import { themeStyle } from '../lib/theme.ts';

/**
 * The book styles as cards, each a tiny page drawn with the theme's own
 * colours, fonts and photo frame. A native radio group: arrow keys move
 * between styles and choosing one saves it straight away. Last, the style
 * Pro will design with AI: shown locked, leading to the plans page.
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
        <Link to="/plans" className="theme-card theme-card-ai">
          <span className="theme-preview ai-preview" aria-hidden="true">
            <span className="ai-sparkles">✦ ✧ ✦</span>
            <span className="ai-prompt">“Monsoon in Kerala, soft greens, handwritten”</span>
            <span className="ai-lock">🔒</span>
          </span>
          <span className="theme-card-text">
            <strong>
              Design with AI <span className="plan-badge">Pro</span>
            </strong>
            <span className="muted">
              Describe a mood and get a style made for this trip. Coming with Pro: see plans.
            </span>
          </span>
        </Link>
      </fieldset>
      {setTheme.isError && (
        <p role="alert" className="form-error">
          Could not change the style. Try again.
        </p>
      )}
    </section>
  );
}
