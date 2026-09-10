import { platformAuthenticatorIsAvailable, startRegistration } from '@simplewebauthn/browser';
import { type ReactNode, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Passkey } from '../api/types';
import { useAction } from '../app/hooks';
import { useSession } from '../app/session';
import { KeyIcon } from '../ui/icons';
import { Button, Card } from '../ui/primitives';

const DISMISSED = 'pct.passkeyOfferDismissed';

/**
 * The offer to add a passkey, made once, after the owner has already signed in with a
 * password on a device that can do it.
 *
 * Asking before the first successful login would be asking someone to secure an account
 * they do not yet have, and asking on a laptop with no fingerprint reader is noise.
 */
export function PasskeyOffer(): ReactNode {
  const { t } = useSession();
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED) === '1') return;

    void (async () => {
      const available = await platformAuthenticatorIsAvailable().catch(() => false);
      if (!available) return;

      // Nothing to offer if this account already has one.
      const existing = await api
        .get<{ passkeys: Passkey[] }>('/auth/passkeys')
        .catch(() => ({ passkeys: [] }));
      if (existing.passkeys.length > 0) return;

      setEligible(true);
    })();
  }, []);

  const enrol = useAction(async () => {
    const options = await api.post<Parameters<typeof startRegistration>[0]['optionsJSON']>(
      '/auth/passkey/register/options',
    );
    const attestation = await startRegistration({ optionsJSON: options });
    await api.post('/auth/passkey/register/verify', {
      response: attestation,
      deviceLabel: navigator.platform || 'device',
    });
  });

  const dismiss = () => {
    localStorage.setItem(DISMISSED, '1');
    setEligible(false);
  };

  if (!eligible) return null;

  return (
    <Card className="mb-4 border-brand/40 bg-brand-soft">
      <h2 className="font-semibold">{t('auth.passkeyOffer')}</h2>
      <p className="mt-1 mb-3 text-sm text-muted">{t('auth.passkeyOfferBody')}</p>

      {enrol.error && <p className="mb-2 text-sm text-alarm">{t('auth.passkeyFailed')}</p>}

      <div className="flex gap-2">
        <Button
          disabled={enrol.pending}
          onClick={() => {
            void enrol.run().then((ok) => {
              if (ok) dismiss();
            });
          }}
          icon={<KeyIcon />}
        >
          {t('auth.passkeyAdd')}
        </Button>
        <Button tone="quiet" onClick={dismiss}>
          {t('auth.passkeyLater')}
        </Button>
      </div>
    </Card>
  );
}
