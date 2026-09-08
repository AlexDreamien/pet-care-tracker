import type { ReactNode } from 'react';

/**
 * Inline icons rather than emoji.
 *
 * An emoji is a font dependency: the worm used for antiparasitic treatment renders as an
 * empty box wherever the glyph is missing, and the ones that do render are loud and
 * childish next to a medical record. These are two-colour strokes that inherit the text
 * colour and always draw.
 */

type IconProps = { className?: string };

function Icon({ children, className = 'size-5' }: IconProps & { children: ReactNode }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function CalendarIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </Icon>
  );
}

export function PawIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <ellipse cx="7.5" cy="9" rx="2" ry="2.6" />
      <ellipse cx="12" cy="7.2" rx="2" ry="2.8" />
      <ellipse cx="16.5" cy="9" rx="2" ry="2.6" />
      <path d="M12 12.4c-2.7 0-5 2.1-5 4.5 0 2 1.7 3.1 3.6 3.1.8 0 1-.4 1.4-.4s.6.4 1.4.4c1.9 0 3.6-1.1 3.6-3.1 0-2.4-2.3-4.5-5-4.5Z" />
    </Icon>
  );
}

export function ContactsIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <rect x="5" y="3" width="15" height="18" rx="2.5" />
      <path d="M5 8H3M5 12H3M5 16H3" />
      <circle cx="12.5" cy="10" r="2.2" />
      <path d="M9 16.5c.6-1.6 2-2.4 3.5-2.4s2.9.8 3.5 2.4" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.5 4.5l1.7 1.7M17.8 17.8l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.5 19.5l1.7-1.7M17.8 6.2l1.7-1.7" />
    </Icon>
  );
}

export function SyringeIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="m14 4 6 6M17.5 6.5 20 4M12.5 5.5 18.5 11.5M4 20l3-3M9.5 8.5 15.5 14.5l-4 4-6-6Z" />
    </Icon>
  );
}

export function ShieldIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M12 3l7 3v5.5c0 4.3-2.9 8.1-7 9.5-4.1-1.4-7-5.2-7-9.5V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function DocumentIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </Icon>
  );
}

export function PillIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <rect x="2.8" y="8.8" width="18.4" height="6.4" rx="3.2" transform="rotate(-45 12 12)" />
      <path d="M9.2 9.2 14.8 14.8" />
    </Icon>
  );
}

export function CakeIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M4 20h16M4.5 20v-5a2.5 2.5 0 0 1 2.5-2.5h10A2.5 2.5 0 0 1 19.5 15v5" />
      <path d="M12 12.5V9M12 6.5V5" />
      <path d="M4.5 16.5c1.9 1.4 3.1-1.4 5-.1 1.9 1.3 3.1-1.4 5-.1 1.6 1.1 2.7-.5 5-.4" />
    </Icon>
  );
}

export function WalletIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H17a2 2 0 0 1 2 2v1.5" />
      <rect x="3" y="7.5" width="18" height="12" rx="2.5" />
      <path d="M21 11.5h-4a2 2 0 0 0 0 4h4" />
    </Icon>
  );
}

export function BowlIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M3.5 11h17a8.5 8.5 0 0 1-8.5 8 8.5 8.5 0 0 1-8.5-8Z" />
      <path d="M8 7.5c0-1.4 1.8-1.4 1.8-2.8M12 7.5c0-1.4 1.8-1.4 1.8-2.8M16 7.5c0-1.4 1.8-1.4 1.8-2.8" />
    </Icon>
  );
}
