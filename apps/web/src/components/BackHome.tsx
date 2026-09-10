import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session';
import { BackIcon } from '../ui/icons';

/**
 * The way back to the pet list from every other screen.
 *
 * The bottom bar already has a Pets tab, but from three levels into a record it is not
 * obviously "home", and on the print sheets the bar is hidden altogether. One link, top
 * left, in the same place on every screen.
 */
export function BackHome({ className = '' }: { className?: string }): ReactNode {
  const { t } = useSession();

  return (
    <Link
      to="/"
      className={`no-print mb-3 inline-flex min-h-11 items-center gap-1 pr-3 text-sm text-muted hover:text-brand ${className}`}
    >
      <BackIcon className="size-5" />
      {t('nav.home')}
    </Link>
  );
}
