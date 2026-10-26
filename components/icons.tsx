import type { ReactNode, SVGProps } from 'react';

// 24px stroke icons, drawn at 20px by default. Deliberately no coins, cards, currency signs or robots.

const icon = (paths: ReactNode) =>
  function Icon({ className = 'size-5', ...props }: SVGProps<SVGSVGElement>) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={className}
        {...props}
      >
        {paths}
      </svg>
    );
  };

export const DashboardIcon = icon(
  <>
    <rect x="3" y="3" width="7" height="9" rx="2" />
    <rect x="14" y="3" width="7" height="5" rx="2" />
    <rect x="14" y="12" width="7" height="9" rx="2" />
    <rect x="3" y="16" width="7" height="5" rx="2" />
  </>,
);
export const InboxIcon = icon(
  <>
    <path d="M3 13h5l1.5 3h5L16 13h5" />
    <path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" />
  </>,
);
export const QuotesIcon = icon(
  <>
    <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </>,
);
export const SettingsIcon = icon(
  <>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </>,
);
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);
export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);
export const ChevronRightIcon = icon(<path d="m9 6 6 6-6 6" />);
export const ChevronLeftIcon = icon(<path d="m15 6-6 6 6 6" />);
export const CheckIcon = icon(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const ClockIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const AlertIcon = icon(
  <>
    <path d="M12 4 2.8 19.5h18.4z" />
    <path d="M12 10v4M12 17h.01" />
  </>,
);
export const MailIcon = icon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </>,
);
export const ExternalIcon = icon(<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />);
export const CloseIcon = icon(<path d="M6 6l12 12M18 6 6 18" />);
export const SparkIcon = icon(<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />);
export const SkipIcon = icon(<path d="M5 5l9 7-9 7zM18 5v14" />);
export const CalendarIcon = icon(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </>,
);
export const PinIcon = icon(
  <>
    <path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12" />
    <circle cx="12" cy="9" r="2.5" />
  </>,
);
