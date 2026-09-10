import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { CloseIcon } from './icons';

/**
 * The small set of pieces every screen is built from.
 *
 * Touch targets are at least 44 px because this is used one-handed, often while holding a
 * lead or an animal that would rather be elsewhere.
 */

export type ButtonTone = 'primary' | 'quiet' | 'danger';

const BUTTON_TONES: Record<ButtonTone, string> = {
  primary: 'bg-brand text-white shadow-button hover:opacity-90',
  quiet: 'bg-surface text-brand border border-brand/25 hover:bg-brand-soft',
  danger: 'bg-alarm-soft text-alarm border border-alarm/30 hover:bg-alarm/15',
};

/**
 * The button look, for things that are links.
 *
 * A route to a print sheet or a `tel:` href is an `<a>` — it has to be, for a long-press
 * and for the browser's own handling — but it should not look different from the button
 * next to it.
 */
export function buttonClasses(tone: ButtonTone = 'primary', full = false): string {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[0.95rem] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:size-5 [&>svg]:shrink-0 ${BUTTON_TONES[tone]} ${full ? 'w-full' : ''}`;
}

export function Button({
  tone = 'primary',
  full,
  icon,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone;
  full?: boolean;
  /** A glyph before the label — or alone, with an `aria-label`, for a compact control. */
  icon?: ReactNode;
}): ReactNode {
  return (
    <button {...rest} className={`${buttonClasses(tone, full)} ${className}`}>
      {icon}
      {children}
    </button>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <section
      className={`rounded-(--radius-card) border border-line bg-surface p-4 shadow-card ${className}`}
    >
      {children}
    </section>
  );
}

/**
 * A screen's title with its glyph on a soft tile.
 *
 * The tile is the same one that marks the screen in the bottom bar, so the two read as
 * the same place.
 */
export function PageHeader({
  icon,
  title,
  action,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
}): ReactNode {
  return (
    <header className="mb-4 flex items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand [&>svg]:size-6">
        {icon}
      </span>
      <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold">{title}</h1>
      {action}
    </header>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}): ReactNode {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-alarm">{error}</span>}
    </label>
  );
}

const CONTROL =
  'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/25';

export function Input({
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement>): ReactNode {
  return <input {...rest} className={`${CONTROL} ${className}`} />;
}

export function Select({
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>): ReactNode {
  return (
    <select {...rest} className={`${CONTROL} ${className}`}>
      {children}
    </select>
  );
}

export function TextArea({
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLTextAreaElement>): ReactNode {
  return (
    <textarea
      {...(rest as Record<string, unknown>)}
      className={`${CONTROL} min-h-24 resize-y ${className}`}
    />
  );
}

type BadgeTone = 'neutral' | 'brand' | 'alarm' | 'calm';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-line/60 text-muted',
  brand: 'bg-brand-soft text-brand',
  alarm: 'bg-alarm-soft text-alarm',
  calm: 'bg-calm-soft text-calm',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}): ReactNode {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Nothing here yet — said kindly.
 *
 * An empty list is the first thing a new owner sees on most screens, so it gets a glyph
 * and a dashed frame rather than one grey line that looks like a loading error.
 */
export function Empty({ icon, children }: { icon?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col items-center gap-2 rounded-(--radius-card) border border-dashed border-line px-4 py-8 text-center">
      {icon && (
        <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand [&>svg]:size-6">
          {icon}
        </span>
      )}
      <p className="text-sm text-muted">{children}</p>
    </div>
  );
}

export function SectionTitle({
  icon,
  children,
  action,
}: {
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}): ReactNode {
  return (
    <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-brand uppercase [&>svg]:size-5 [&>svg]:shrink-0">
        {icon}
        {children}
      </h2>
      {action}
    </div>
  );
}

/**
 * A bottom sheet on a phone, a centred dialog on a desktop.
 *
 * Rendered as a real `<dialog>`-shaped overlay rather than a route, so a half-filled form
 * is never one back-swipe from being lost.
 */
export function Sheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}): ReactNode {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <button
        type="button"
        aria-label="close"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
      />
      <div className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-canvas p-4 sm:max-w-lg sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button
            tone="quiet"
            icon={<CloseIcon />}
            aria-label="close"
            onClick={onClose}
            className="px-3"
          />
        </div>
        {children}
      </div>
    </div>
  );
}
