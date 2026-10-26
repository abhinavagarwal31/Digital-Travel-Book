import { loginBodySchema, registerBodySchema } from '@tb/shared';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { Field } from '../components/Field.tsx';
import { useCurrentUser, useLogin, useRegister } from '../lib/auth.ts';
import { apiErrors, zodFieldErrors, type FieldErrors } from '../lib/forms.ts';

type Mode = 'login' | 'register';

export function AuthPage({ mode }: { mode: Mode }) {
  const me = useCurrentUser();
  const login = useLogin();
  const register = useRegister();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (me.data) return <Navigate to={from} replace />;

  const edit =
    (field: 'name' | 'email' | 'password', setter: (v: string) => void) => (value: string) => {
      setter(value);
      setErrors((e) => ({ ...e, [field]: undefined }));
    };

  const pending = login.isPending || register.isPending;
  const isRegister = mode === 'register';

  async function submit(send: () => Promise<unknown>) {
    setErrors({});
    try {
      await send();
      navigate(from, { replace: true });
    } catch (err) {
      const result = apiErrors(err);
      setErrors(result.fields);
      setFormError(result.form);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    // Same schemas as the API, so most mistakes are caught before a request.
    if (isRegister) {
      const parsed = registerBodySchema.safeParse({ name, email, password });
      if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
      await submit(() => register.mutateAsync(parsed.data));
    } else {
      const parsed = loginBodySchema.safeParse({ email, password });
      if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
      await submit(() => login.mutateAsync(parsed.data));
    }
  }

  return (
    <div className="auth-shell">
      <section className="card auth-card stack">
        <div className="stack" style={{ gap: '0.4rem' }}>
          <h1>{isRegister ? 'Create your account' : 'Log in'}</h1>
          <p className="muted">
            {isRegister
              ? 'Your books stay private to you.'
              : 'Welcome back. Your books are waiting.'}
          </p>
        </div>
        <form className="stack" onSubmit={handleSubmit} noValidate>
          {isRegister && (
            <Field label="Name" error={errors.name}>
              {(p) => (
                <input
                  {...p}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => edit('name', setName)(e.target.value)}
                />
              )}
            </Field>
          )}
          <Field label="Email" error={errors.email}>
            {(p) => (
              <input
                {...p}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => edit('email', setEmail)(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Password"
            error={errors.password}
            {...(isRegister ? { hint: 'At least 8 characters.' } : {})}
          >
            {(p) => (
              <input
                {...p}
                type="password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => edit('password', setPassword)(e.target.value)}
              />
            )}
          </Field>

          {formError && (
            <p role="alert" className="form-error">
              {formError}
            </p>
          )}

          <button type="submit" className="button large" disabled={pending}>
            {pending ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}
          </button>
        </form>
        <p className="muted">
          {isRegister ? (
            <>
              Already have an account? <Link to="/login">Log in</Link>
            </>
          ) : (
            <>
              New here? <Link to="/register">Create an account</Link>
            </>
          )}
        </p>
      </section>
    </div>
  );
}
