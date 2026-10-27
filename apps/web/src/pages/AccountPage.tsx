import { changePasswordBodySchema, PLANS, updateAccountBodySchema, type Account } from '@tb/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Field } from '../components/Field.tsx';
import { Loading, LoadError } from '../components/LoadState.tsx';
import {
  useAccount,
  useChangePassword,
  useDeleteAccount,
  useSignOutOthers,
  useUpdateAccount,
} from '../lib/account.ts';
import { apiErrors, zodFieldErrors, type FieldErrors } from '../lib/forms.ts';
import { initials } from '../lib/names.ts';

const memberSince = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

/** Your account: who you are, your plan and what you use, your password, and leaving. */
export function AccountPage() {
  const account = useAccount();
  if (account.isPending) return <Loading />;
  if (account.isError) {
    return <LoadError what="your account" onRetry={() => void account.refetch()} />;
  }
  const a = account.data;
  return (
    <section className="stack account-page" style={{ gap: '1.75rem' }}>
      <header className="account-hero">
        <span className="avatar large" aria-hidden="true">
          {initials(a.user.name)}
        </span>
        <div className="stack" style={{ gap: '0.3rem' }}>
          <p className="eyebrow">Your account</p>
          <h1>{a.user.name}</h1>
          <p className="muted">
            {a.user.email} · Travelling with us since{' '}
            {memberSince.format(new Date(a.user.createdAt))}
          </p>
        </div>
      </header>

      <PlanCard account={a} />
      <ProfileForm account={a} />
      <PasswordForm />
      <Devices />
      <DeleteAccount />
    </section>
  );
}

function PlanCard({ account }: { account: Account }) {
  const plan = PLANS[account.plan];
  const fullest = account.usage.fullestBook;
  return (
    <section className="card stack" aria-labelledby="plan-heading" style={{ gap: '1rem' }}>
      <div className="page-title">
        <h2 id="plan-heading">
          Your plan: <span className="plan-badge">{plan.name}</span>
        </h2>
        <Link to="/plans" className="button ghost">
          Compare plans
        </Link>
      </div>
      <dl className="usage">
        <div>
          <dt>Books</dt>
          <dd>{account.usage.books}</dd>
        </div>
        <div>
          <dt>Photos</dt>
          <dd>{account.usage.photos}</dd>
        </div>
        <div>
          <dt>Photos per book</dt>
          <dd>up to {account.photoLimit}</dd>
        </div>
      </dl>
      {fullest && (
        <div className="stack" style={{ gap: '0.4rem' }}>
          <p className="muted">
            Your fullest book, <strong>{fullest.title}</strong>, has {fullest.photos} of its{' '}
            {account.photoLimit} photos.
          </p>
          <meter
            className="usage-meter"
            min={0}
            max={account.photoLimit}
            low={account.photoLimit * 0.75}
            high={account.photoLimit * 0.9}
            optimum={0}
            value={fullest.photos}
            aria-label={`${fullest.title}: ${fullest.photos} of ${account.photoLimit} photos`}
          />
        </div>
      )}
    </section>
  );
}

function ProfileForm({ account }: { account: Account }) {
  const update = useUpdateAccount();
  const [name, setName] = useState(account.user.name);
  const [email, setEmail] = useState(account.user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const emailChanged = email.trim().toLowerCase() !== account.user.email;

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const parsed = updateAccountBodySchema.safeParse({
      ...(name.trim() !== account.user.name && { name }),
      ...(emailChanged && { email, currentPassword: currentPassword || undefined }),
    });
    if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
    setErrors({});
    try {
      await update.mutateAsync(parsed.data);
      setCurrentPassword('');
      setMessage('Saved.');
    } catch (err) {
      const result = apiErrors(err);
      setErrors({ ...result.fields, ...(result.form && { form: result.form }) });
    }
  }

  const unchanged = name.trim() === account.user.name && !emailChanged;
  return (
    <form className="card stack" onSubmit={save} noValidate aria-labelledby="profile-heading">
      <h2 id="profile-heading">Profile</h2>
      <div className="form-row">
        <Field label="Name" error={errors.name}>
          {(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Email" error={errors.email}>
          {(p) => (
            <input
              {...p}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
      </div>
      {emailChanged && (
        <Field
          label="Current password"
          error={errors.currentPassword}
          hint="Needed to change the email you log in with."
        >
          {(p) => (
            <input
              {...p}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          )}
        </Field>
      )}
      {errors.form && (
        <p role="alert" className="form-error">
          {errors.form}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button" disabled={update.isPending || unchanged}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </button>
        <span className="muted" role="status">
          {message}
        </span>
      </div>
    </form>
  );
}

function PasswordForm() {
  const change = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const parsed = changePasswordBodySchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
    setErrors({});
    try {
      await change.mutateAsync(parsed.data);
      setCurrentPassword('');
      setNewPassword('');
      setMessage('Password changed. Any other devices have been logged out.');
    } catch (err) {
      const result = apiErrors(err);
      setErrors({ ...result.fields, ...(result.form && { form: result.form }) });
    }
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate aria-labelledby="password-heading">
      <h2 id="password-heading">Password</h2>
      <div className="form-row">
        <Field label="Current password" error={errors.currentPassword}>
          {(p) => (
            <input
              {...p}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          )}
        </Field>
        <Field label="New password" error={errors.newPassword} hint="At least 8 characters.">
          {(p) => (
            <input
              {...p}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          )}
        </Field>
      </div>
      {errors.form && (
        <p role="alert" className="form-error">
          {errors.form}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button" disabled={change.isPending}>
          {change.isPending ? 'Changing…' : 'Change password'}
        </button>
        <span className="muted" role="status">
          {message}
        </span>
      </div>
    </form>
  );
}

function Devices() {
  const signOut = useSignOutOthers();
  return (
    <section className="card stack" aria-labelledby="devices-heading" style={{ gap: '0.8rem' }}>
      <h2 id="devices-heading">Devices</h2>
      <p className="muted">
        Logged in somewhere you no longer use, like a shared computer? Log out everywhere except
        here.
      </p>
      <div className="actions">
        <button
          type="button"
          className="button ghost"
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
        >
          Log out of other devices
        </button>
        <span className="muted" role="status">
          {signOut.isSuccess && 'Done. Only this device is logged in now.'}
          {signOut.isError && 'Could not do that. Try again.'}
        </span>
      </div>
    </section>
  );
}

function DeleteAccount() {
  const remove = useDeleteAccount();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!password) return setError('Enter your password');
    try {
      await remove.mutateAsync(password);
      navigate('/', { replace: true });
    } catch (err) {
      const result = apiErrors(err);
      setError(result.fields.password ?? result.form);
    }
  }

  return (
    <section
      className="danger-zone stack"
      aria-labelledby="delete-heading"
      style={{ gap: '0.8rem' }}
    >
      <h2 id="delete-heading">Delete account</h2>
      <p className="muted">
        This deletes your account and every book in it: photos, captions, diaries and all. It cannot
        be undone.
      </p>
      {open ? (
        <form className="stack" onSubmit={submit} noValidate style={{ gap: '0.8rem' }}>
          <Field label="Your password, to confirm" error={error ?? undefined}>
            {(p) => (
              <input
                {...p}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          <div className="actions">
            <button type="submit" className="button danger" disabled={remove.isPending}>
              {remove.isPending ? 'Deleting…' : 'Delete my account and all my books'}
            </button>
            <button type="button" className="button ghost" onClick={() => setOpen(false)}>
              Keep my account
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="button ghost danger-text" onClick={() => setOpen(true)}>
          Delete account…
        </button>
      )}
    </section>
  );
}
