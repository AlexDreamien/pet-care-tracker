import { type ReactNode, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAction, useResource } from '../app/hooks';
import { useSession } from '../app/session';
import { BellIcon, PowerIcon } from '../ui/icons';
import { Badge, Button, Card, SectionTitle } from '../ui/primitives';

interface PushKey {
  enabled: boolean;
  publicKey: string | null;
}

interface PushDevice {
  id: string;
  deviceLabel: string | null;
  createdAt: string;
  lastSentAt: string | null;
}

/**
 * The VAPID key travels as base64url and the browser wants bytes.
 *
 * Built over an explicit `ArrayBuffer` rather than with `Uint8Array.from`: the latter is
 * typed over `ArrayBufferLike`, which `pushManager.subscribe` will not accept.
 */
function decodeKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));

  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Turning notifications on, and being honest about what they are.
 *
 * Push is the second channel. The calendar subscription above it keeps working when this
 * application has not been opened for six months, on a phone that never granted a
 * notification permission — so this section says so rather than presenting push as the way
 * reminders arrive.
 */
export function NotificationsSection(): ReactNode {
  const { t } = useSession();
  const key = useResource<PushKey>('/push/key');
  const devices = useResource<{ subscriptions: PushDevice[] }>('/push/subscriptions');

  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const [installedForIos, setInstalledForIos] = useState(true);

  useEffect(() => {
    // On iOS a web page cannot subscribe at all until it has been added to the home screen;
    // saying so beats a permission prompt that silently never appears.
    const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    setInstalledForIos(!iOS || standalone);
  }, []);

  const enable = useAction(async () => {
    if (!key.data?.publicKey) return;

    const granted = await Notification.requestPermission();
    setPermission(granted);
    if (granted !== 'granted') return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      // Required by every browser: a push must result in something the person can see.
      userVisibleOnly: true,
      applicationServerKey: decodeKey(key.data.publicKey),
    });

    const payload = subscription.toJSON() as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    await api.post('/push/subscribe', {
      endpoint: payload.endpoint,
      keys: payload.keys,
      deviceLabel: navigator.platform || 'device',
    });
    devices.reload();
  });

  const disable = useAction(async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await api.post('/push/unsubscribe', { endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
    devices.reload();
  });

  const test = useAction(async () => {
    await api.post('/push/test');
  });

  if (key.data && !key.data.enabled) {
    return (
      <section>
        <SectionTitle>{t('push.title')}</SectionTitle>
        <Card>
          <p className="text-sm text-muted">{t('push.unavailable')}</p>
        </Card>
      </section>
    );
  }

  const subscribed = (devices.data?.subscriptions.length ?? 0) > 0;

  return (
    <section>
      <SectionTitle>{t('push.title')}</SectionTitle>
      <Card className="space-y-3">
        <p className="text-sm text-muted">{t('push.body')}</p>

        {permission === 'unsupported' && (
          <p className="text-sm text-muted">{t('push.unsupported')}</p>
        )}

        {!installedForIos && (
          <p className="rounded-xl bg-calm-soft px-3 py-2 text-sm text-calm">
            {t('push.installFirst')}
          </p>
        )}

        {permission === 'denied' && (
          <p className="rounded-xl bg-alarm-soft px-3 py-2 text-sm text-alarm">
            {t('push.denied')}
          </p>
        )}

        {subscribed && (
          <ul className="text-sm">
            {devices.data?.subscriptions.map((device) => (
              <li
                key={device.id}
                className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0"
              >
                <span>{device.deviceLabel ?? '—'}</span>
                <Badge tone="brand">{t('push.on')}</Badge>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          {!subscribed && (
            <Button
              disabled={
                enable.pending ||
                permission === 'denied' ||
                permission === 'unsupported' ||
                !installedForIos
              }
              onClick={() => void enable.run()}
              icon={<BellIcon />}
            >
              {t('push.enable')}
            </Button>
          )}

          {subscribed && (
            <>
              <Button
                tone="quiet"
                disabled={test.pending}
                onClick={() => void test.run()}
                icon={<BellIcon />}
              >
                {t('push.test')}
              </Button>
              <Button
                tone="danger"
                disabled={disable.pending}
                onClick={() => void disable.run()}
                icon={<PowerIcon />}
              >
                {t('push.disable')}
              </Button>
            </>
          )}
        </div>
      </Card>
    </section>
  );
}
