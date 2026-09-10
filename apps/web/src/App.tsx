import type { ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useOnline } from './app/hooks';
import { useSession } from './app/session';
import { AgendaPage } from './pages/AgendaPage';
import { ContactsPage } from './pages/ContactsPage';
import { FoundPage } from './pages/FoundPage';
import { SitterPage } from './pages/SitterPage';
import { CardPrintPage, TagPrintPage } from './pages/pet/PrintPages';
import { ExpensesPage } from './pages/ExpensesPage';
import { PetPage } from './pages/PetPage';
import { PetsPage } from './pages/PetsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SignInPage } from './pages/SignInPage';
import type { MessageKey } from './lib/i18n';
import { CalendarIcon, ContactsIcon, PawIcon, SettingsIcon, WalletIcon } from './ui/icons';

const TABS: { to: string; key: MessageKey; Icon: (props: { className?: string }) => ReactNode }[] =
  [
    { to: '/', key: 'nav.pets', Icon: PawIcon },
    { to: '/agenda', key: 'nav.agenda', Icon: CalendarIcon },
    { to: '/expenses', key: 'nav.expenses', Icon: WalletIcon },
    { to: '/contacts', key: 'nav.contacts', Icon: ContactsIcon },
    { to: '/settings', key: 'nav.settings', Icon: SettingsIcon },
  ];

function OfflineBanner(): ReactNode {
  const online = useOnline();
  const { t } = useSession();
  if (online) return null;

  return (
    <p className="bg-calm-soft px-4 py-2 text-center text-sm text-calm" role="status">
      {t('state.offline')}
    </p>
  );
}

export function App(): ReactNode {
  return (
    <Routes>
      {/* Public, and outside the sign-in gate: whoever found the animal has no account. */}
      <Route path="/found/:token" element={<FoundPage />} />
      {/* Also public: whoever is looking after the animal has no account either. */}
      <Route path="/sitter/:token" element={<SitterPage />} />
      <Route path="*" element={<SignedInApp />} />
    </Routes>
  );
}

function SignedInApp(): ReactNode {
  const { status, t } = useSession();

  if (status === 'loading') {
    return (
      <main className="grid min-h-dvh place-items-center text-muted">{t('state.loading')}</main>
    );
  }

  if (status === 'signedOut') return <SignInPage />;

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <OfflineBanner />

      {/* Space at the bottom keeps the last row clear of the navigation bar. */}
      <main className="mx-auto w-full max-w-3xl px-4 pt-4 pb-28">
        <Routes>
          {/* The pet list is home: it is what the app is about, and where a record starts. */}
          <Route path="/" element={<PetsPage />} />
          <Route path="/agenda" element={<AgendaPage />} />
          {/* The list used to live here; old bookmarks and installed shortcuts still do. */}
          <Route path="/pets" element={<Navigate to="/" replace />} />
          <Route path="/pets/:petId/print/tag" element={<TagPrintPage />} />
          <Route path="/pets/:petId/print/card" element={<CardPrintPage />} />
          <Route path="/pets/:petId/*" element={<PetPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-3xl">
          {TABS.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                end={tab.to === '/'}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
                    isActive ? 'text-brand' : 'text-muted'
                  }`
                }
              >
                <tab.Icon className="size-6" />
                {t(tab.key)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
