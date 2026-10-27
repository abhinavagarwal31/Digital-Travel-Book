import { useId, useState } from 'react';
import { useAutosave, type SaveState } from '../lib/autosave.ts';

const STATUS: Record<SaveState, string> = {
  idle: '',
  pending: 'Editing…',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Not saved.',
};

/** A text field that saves itself; its status line says when the words are safe. */
export function AutosaveField({
  label,
  initial,
  onSave,
  multiline = false,
  maxLength,
  placeholder,
  className = '',
}: {
  label: string;
  initial: string;
  onSave: (value: string) => Promise<unknown>;
  multiline?: boolean;
  maxLength: number;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  const [text, setText] = useState(initial);
  const { state, change, flush } = useAutosave(onSave);
  const props = {
    id,
    value: text,
    maxLength,
    placeholder,
    'aria-describedby': `${id}-status`,
    onChange: (e: { target: { value: string } }) => {
      setText(e.target.value);
      change(e.target.value);
    },
    onBlur: () => void flush(),
  };
  const nearLimit = text.length > maxLength * 0.8;

  return (
    <div className={`autosave ${className}`} data-state={state}>
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      {multiline ? <textarea rows={4} {...props} /> : <input type="text" {...props} />}
      <p id={`${id}-status`} className="autosave-status" aria-live="polite">
        <span>{STATUS[state]}</span>
        {state === 'error' && (
          <button type="button" className="link-button" onClick={() => void flush()}>
            Try again
          </button>
        )}
        {nearLimit && (
          <span className="autosave-count">
            {text.length} / {maxLength}
          </span>
        )}
      </p>
    </div>
  );
}
