import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

/**
 * The small set of pieces every screen is built from.
 *
 * Touch targets are at least 44 px because this is used one-handed, often while holding a
 * lead or an animal that would rather be elsewhere.
 */

type ButtonTone = 'primary' | 'quiet' | 'danger';

const BUTTON_TONES: Record<ButtonTone, string> = {
  primary: 'bg-brand text-white hover:opacity-90',
  quiet: 'bg-surface text-ink border border-line hover:bg-brand-soft',
  danger: 'bg-alarm-soft text-alarm border border-alarm/30 hover:bg-alarm/15',
};

export function Button({
  tone = 'primary',
  full,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone;
  full?: boolean;
}): ReactNode {
  return (
    <button
      {...rest}
      className={`min-h-11 rounded-xl px-4 py-2.5 text-[0.95rem] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_TONES[tone]} ${full ? 'w-full' : ''} ${className}`}
    >
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
    <section className={`rounded-(--radius-card) border border-line bg-surface p-4 ${className}`}>
      {children}
    </section>
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

export function Empty({ children }: { children: ReactNode }): ReactNode {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>;
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}): ReactNode {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{children}</h2>
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
          <Button tone="quiet" onClick={onClose} className="px-3 py-1">
            ✕
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
