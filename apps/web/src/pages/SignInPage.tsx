import { startAuthentication } from '@simplewebauthn/browser';
import { type FormEvent, type ReactNode, useState } from 'react';
import { api } from '../api/client';
import { useAction } from '../app/hooks';
import { useSession } from '../app/session';
import { Button, Card, Field, Input } from '../ui/primitives';

type Mode = 'signIn' | 'register';

export function SignInPage(): ReactNode {
  const { t, refresh } = useSession();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  const submit = useAction(async () => {
    if (mode === 'signIn') {
      await api.post('/auth/login', { email, password });
      await refresh();
      return;
    }

    const created = await api.post<{ recoveryCode: string }>('/auth/register', {
      email,
      password,
      displayName,
    });
    // Shown before the app opens, because it is shown exactly once.
    setRecoveryCode(created.recoveryCode);
  });

  const passkey = useAction(async () => {
    const options = await api.post<Parameters<typeof startAuthentication>[0]['optionsJSON']>(
      '/auth/passkey/login/options',
    );
    const assertion = await startAuthentication({ optionsJSON: options });
    await api.post('/auth/passkey/login/verify', { response: assertion });
    await refresh();
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit.run();
  };

  if (recoveryCode) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-4">
        <Card>
          <h1 className="mb-2 text-lg font-semibold">{t('auth.recoveryTitle')}</h1>
          <p className="mb-4 text-sm text-muted">{t('auth.recoveryBody')}</p>
          <p className="mb-4 rounded-xl bg-brand-soft px-4 py-3 text-center font-mono text-lg tracking-wider text-brand select-all">
            {recoveryCode}
          </p>
          <Button full onClick={() => void refresh()}>
            {t('auth.recoverySaved')}
          </Button>
        </Card>
      </main>
    );
  }

  const error = submit.error;
  const message =
    error?.code === 'invalid_credentials'
      ? t('auth.wrongCredentials')
      : error?.code === 'email_taken'
        ? t('auth.emailTaken')
        : error?.code === 'offline'
          ? t('state.offlineWrite')
          : error && error.code !== 'validation_failed'
            ? t('state.error')
            : null;

  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-4">
      <div className="w-full">
        <h1 className="mb-6 text-center text-2xl font-semibold">{t('app.name')}</h1>

        <Card>
          <form onSubmit={onSubmit} className="space-y-3">
            {mode === 'register' && (
              <Field label={t('auth.displayName')} error={error?.fieldError('displayName')}>
                <Input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="name"
                  required
                />
              </Field>
            )}

            <Field label={t('auth.email')} error={error?.fieldError('email')}>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                inputMode="email"
                required
              />
            </Field>

            <Field
              label={t('auth.password')}
              hint={mode === 'register' ? t('auth.passwordHint') : undefined}
              error={error?.fieldError('password')}
            >
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                required
              />
            </Field>

            {message && (
              <p className="rounded-xl bg-alarm-soft px-3 py-2 text-sm text-alarm" role="alert">
                {message}
              </p>
            )}

            <Button full type="submit" disabled={submit.pending}>
              {mode === 'signIn' ? t('action.signIn') : t('action.register')}
            </Button>
          </form>

          {mode === 'signIn' && (
            <>
              <Button
                full
                tone="quiet"
                className="mt-3"
                disabled={passkey.pending}
                onClick={() => void passkey.run()}
              >
                {t('auth.passkeySignIn')}
              </Button>
              {passkey.error && (
                <p className="mt-2 text-center text-xs text-muted">{t('auth.passkeyFailed')}</p>
              )}
            </>
          )}
        </Card>

        <p className="mt-4 text-center text-sm text-muted">
          {mode === 'signIn' ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
          <button
            type="button"
            className="font-medium text-brand underline"
            onClick={() => {
              setMode(mode === 'signIn' ? 'register' : 'signIn');
              submit.reset();
            }}
          >
            {mode === 'signIn' ? t('action.register') : t('action.signIn')}
          </button>
        </p>
      </div>
    </main>
  );
}
