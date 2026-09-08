import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { HouseholdSummary, Session, User } from '../api/types';
import { type Locale, type Translate, translator } from '../lib/i18n';

interface SessionState {
  status: 'loading' | 'signedIn' | 'signedOut';
  user: User | null;
  households: HouseholdSummary[];
  household: HouseholdSummary | null;
  locale: Locale;
  t: Translate;
  /** Re-reads the session; call after anything that changes the profile. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** True when the member may change things; a viewer sees the same screens read-only. */
  canWrite: boolean;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }): ReactNode {
  const [status, setStatus] = useState<SessionState['status']>('loading');
  const [session, setSession] = useState<Session | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.get<Session>('/auth/me');
      setSession(next);
      setStatus('signedIn');
    } catch (error) {
      // Offline with no cached session still means the app cannot be used; showing the
      // sign-in screen is honest, and the service worker will serve the shell.
      if (error instanceof ApiError && error.code === 'unauthenticated') setSession(null);
      setStatus('signedOut');
    }
  }, []);

  const signOut = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setSession(null);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const locale: Locale = session?.user.locale ?? 'ru';
  const household = session?.households[0] ?? null;

  const value: SessionState = {
    status,
    user: session?.user ?? null,
    households: session?.households ?? [],
    household,
    locale,
    t: translator(locale),
    refresh,
    signOut,
    canWrite: household ? household.role !== 'viewer' : false,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession outside a SessionProvider');
  return value;
}

/** The signed-in user, for screens that only render behind the sign-in gate. */
export function useUser(): User {
  const { user } = useSession();
  if (!user) throw new Error('useUser outside a signed-in route');
  return user;
}
