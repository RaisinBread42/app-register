import type { SVGProps } from "react";

/**
 * The prototype's line icons, for Astryx `Icon` (custom SVG components, as
 * `astryx docs icons` describes). Icon sets their size and colour.
 */

type IconProps = SVGProps<SVGSVGElement>;

function LineIcon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const OverviewIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M7 14l3-4 3 3 4-6" />
  </LineIcon>
);

export const AppsIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </LineIcon>
);

export const SourcesIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <circle cx="12" cy="12" r="2" />
    <path d="M7.7 7.7a6 6 0 0 0 0 8.6m8.6 0a6 6 0 0 0 0-8.6M4.3 4.3a11 11 0 0 0 0 15.4m15.4 0a11 11 0 0 0 0-15.4" />
  </LineIcon>
);

export const NoticesIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </LineIcon>
);

export const SettingsIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.9l-1.8 1.8a1.7 1.7 0 0 0-1.9-.34 1.7 1.7 0 0 0-1 1.58H9a1.7 1.7 0 0 0-1-1.58 1.7 1.7 0 0 0-1.9.34l-1.8-1.8A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14v-4a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.34-1.9l1.8-1.8a1.7 1.7 0 0 0 1.9.34A1.7 1.7 0 0 0 9 4h6a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.34l1.8 1.8a1.7 1.7 0 0 0-.34 1.9A1.7 1.7 0 0 0 21 10v4a1.7 1.7 0 0 0-1.6 1Z" />
  </LineIcon>
);

export const PeopleIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" />
  </LineIcon>
);

export const CalendarIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M7 3v4M17 3v4M3 10h18" />
  </LineIcon>
);

export const ShieldIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <path d="m12 2 8 4v5c0 5-3 9-8 11-5-2-8-6-8-11V6l8-4Z" />
    <path d="m9 12 2 2 4-4" />
  </LineIcon>
);

export const CloudIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <path d="M19 18H6a4 4 0 0 1-.6-8A6 6 0 0 1 17 8a5 5 0 0 1 2 10" />
  </LineIcon>
);

export const BoxIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <path d="m12 2 9 5-9 5-9-5 9-5Zm-9 5v10l9 5 9-5V7M12 12v10" />
  </LineIcon>
);

export const ArrowIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <path d="M4 12h16m-7-7 7 7-7 7" />
  </LineIcon>
);

export const BackArrowIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <path d="M20 12H4m7-7-7 7 7 7" />
  </LineIcon>
);

export const WarningIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <path d="m12 3 10 18H2L12 3Zm0 7v4m0 4h.01" />
  </LineIcon>
);

export const InfoIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 11v6m0-10h.01" />
  </LineIcon>
);

export const PencilIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />
  </LineIcon>
);

export const ClockIcon = (props: IconProps) => (
  <LineIcon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </LineIcon>
);

export const DiamondIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M12 2 22 12 12 22 2 12Z" />
  </svg>
);
