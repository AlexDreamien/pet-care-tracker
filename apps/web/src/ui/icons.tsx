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

export function BackIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M15 5l-7 7 7 7" />
    </Icon>
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

/* Actions. */

export function PlusIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m13 8 3 3" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="m9 5 7 7-7 7" />
    </Icon>
  );
}

export function ArchiveIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="4" rx="1.5" />
      <path d="M5 8v11a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8M10 12h4" />
    </Icon>
  );
}

export function CameraIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
      <circle cx="12" cy="13" r="3.2" />
    </Icon>
  );
}

export function PrintIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M7 8V4h10v4" />
      <path d="M7 16H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
      <rect x="7" y="13" width="10" height="7" rx="1" />
    </Icon>
  );
}

export function RefreshIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v4.5h-4.5" />
    </Icon>
  );
}

export function CopyIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
    </Icon>
  );
}

export function UploadIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 19h16" />
    </Icon>
  );
}

export function DownloadIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4 19h16" />
    </Icon>
  );
}

export function SignOutIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 8l4 4-4 4M18 12H9" />
    </Icon>
  );
}

export function PowerIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M12 4v8M6.3 7.3a8 8 0 1 0 11.4 0" />
    </Icon>
  );
}

/* Things. */

export function KeyIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <circle cx="8" cy="14" r="3.5" />
      <path d="M10.5 11.5 19 3M15 7l2.5 2.5M12.5 9.5 15 12" />
    </Icon>
  );
}

export function PhoneIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5L16 14l4 1.5V19a1.5 1.5 0 0 1-1.5 1.5C10.6 20.5 3.5 13.4 3.5 5.5A1.5 1.5 0 0 1 5 4Z" />
    </Icon>
  );
}

export function GlobeIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.5 2.5 14.5 0 17M12 3.5c-2.5 2.5-2.5 14.5 0 17" />
    </Icon>
  );
}

export function BellIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </Icon>
  );
}

export function ScaleIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8.5 11a3.5 3.5 0 0 1 7 0M12 11l1.8-1.8" />
    </Icon>
  );
}

export function FlaskIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M10 3h4M10 3v6l-5 9a1.5 1.5 0 0 0 1.3 2.2h11.4A1.5 1.5 0 0 0 19 18l-5-9V3" />
      <path d="M8 15h8" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

export function UserIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </Icon>
  );
}

export function HeartIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M12 20.5s-7.5-4.7-7.5-10A4 4 0 0 1 12 8.1a4 4 0 0 1 7.5 2.4c0 5.3-7.5 10-7.5 10Z" />
    </Icon>
  );
}

export function LinkIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </Icon>
  );
}

export function TagIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M3.5 12.5V5a1.5 1.5 0 0 1 1.5-1.5h7.5l8 8-9 9-8-8Z" />
      <circle cx="8" cy="8" r="1.3" />
    </Icon>
  );
}

export function StarIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8L12 3.5Z" />
    </Icon>
  );
}

export function HomeIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="m3.5 11 8.5-7 8.5 7" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3.5v-5h3v5H17a1 1 0 0 0 1-1v-9" />
    </Icon>
  );
}
