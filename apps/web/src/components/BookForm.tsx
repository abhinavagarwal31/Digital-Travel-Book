import { createBookBodySchema, type CreateBookBody } from '@tb/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { apiErrors, zodFieldErrors, type FieldErrors } from '../lib/forms.ts';
import { Field } from './Field.tsx';

export interface BookFormValues {
  title: string;
  startDate: string;
  endDate: string;
  defaultTz: string;
  destinations: string; // comma-separated while editing
  description: string;
}

export function toFormValues(book: CreateBookBody): BookFormValues {
  return {
    title: book.title,
    startDate: book.startDate,
    endDate: book.endDate,
    defaultTz: book.defaultTz,
    destinations: book.destinations.join(', '),
    description: book.description ?? '',
  };
}

function toBody(values: BookFormValues): unknown {
  return {
    title: values.title,
    startDate: values.startDate,
    endDate: values.endDate,
    defaultTz: values.defaultTz,
    destinations: values.destinations
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean),
    description: values.description,
  };
}

interface BookFormProps {
  initial: BookFormValues;
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (body: CreateBookBody) => Promise<unknown>;
  onCancel?: () => void;
}

export function BookForm({
  initial,
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel,
}: BookFormProps) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const timeZones = useMemo(() => Intl.supportedValuesOf('timeZone'), []);

  // Editing a field clears its error, so a fixed mistake stops being flagged.
  const set = (field: keyof BookFormValues) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    // The same schema the API uses, so most mistakes are caught before a request.
    const parsed = createBookBodySchema.safeParse(toBody(values));
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      const { fields, form } = apiErrors(err);
      setErrors(fields);
      setFormError(form);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      <Field label="Title" error={errors.title}>
        {(p) => (
          <input
            {...p}
            value={values.title}
            onChange={(e) => set('title')(e.target.value)}
            placeholder="Whispers of Japan"
          />
        )}
      </Field>

      <div className="row">
        <Field label="Start date" error={errors.startDate}>
          {(p) => (
            <input
              {...p}
              type="date"
              value={values.startDate}
              onChange={(e) => set('startDate')(e.target.value)}
            />
          )}
        </Field>
        <Field label="End date" error={errors.endDate}>
          {(p) => (
            <input
              {...p}
              type="date"
              value={values.endDate}
              onChange={(e) => set('endDate')(e.target.value)}
            />
          )}
        </Field>
      </div>

      <Field
        label="Time zone"
        error={errors.defaultTz}
        hint="Used only for photos whose own metadata does not say where they were taken."
      >
        {(p) => (
          <>
            <input
              {...p}
              list="time-zones"
              value={values.defaultTz}
              onChange={(e) => set('defaultTz')(e.target.value)}
            />
            <datalist id="time-zones">
              {timeZones.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
          </>
        )}
      </Field>

      <Field label="Destinations" error={errors.destinations} hint="Separate with commas.">
        {(p) => (
          <input
            {...p}
            value={values.destinations}
            onChange={(e) => set('destinations')(e.target.value)}
            placeholder="Tokyo, Kyoto, Osaka"
          />
        )}
      </Field>

      <Field label="Description (optional)" error={errors.description}>
        {(p) => (
          <textarea
            {...p}
            rows={3}
            value={values.description}
            onChange={(e) => set('description')(e.target.value)}
          />
        )}
      </Field>

      {formError && (
        <p role="alert" className="form-error">
          {formError}
        </p>
      )}

      <div className="actions">
        <button type="submit" className="button" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="button ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
