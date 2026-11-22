const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const ChatIcon = () => (
  <svg {...base}>
    <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
  </svg>
)
export const MeetingIcon = () => (
  <svg {...base}>
    <rect x="3" y="6" width="12" height="12" rx="2.5" />
    <path d="M15 10.5l6-3.5v10l-6-3.5z" />
  </svg>
)
export const PeopleIcon = () => (
  <svg {...base}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
    <path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.8c1.8.7 3 2.4 3.4 5.2" />
  </svg>
)
export const GearIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
)
export const PlusIcon = () => (
  <svg {...base} strokeWidth={2.4}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const SendIcon = () => (
  <svg {...base} strokeWidth={2.1}>
    <path d="M3.5 11.5L20.5 4l-4 16-5-6.5z" />
    <path d="M11.5 13.5L20.5 4" />
  </svg>
)
export const BackIcon = () => (
  <svg {...base} strokeWidth={2.2}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
)
export const SearchIcon = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
)

const fill = { viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true }
export const PlayIcon = () => (
  <svg {...fill}>
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
  </svg>
)
export const PauseIcon = () => (
  <svg {...fill}>
    <rect x="6" y="5" width="4.2" height="14" rx="1.2" />
    <rect x="13.8" y="5" width="4.2" height="14" rx="1.2" />
  </svg>
)
export const NextIcon = () => (
  <svg {...fill}>
    <path d="M6 6.4v11.2a.9.9 0 0 0 1.4.75l8.2-5.6a.9.9 0 0 0 0-1.5L7.4 5.65A.9.9 0 0 0 6 6.4z" />
    <rect x="16.6" y="5.5" width="2.6" height="13" rx="1.1" />
  </svg>
)
export const PrevIcon = () => (
  <svg {...fill} style={{ transform: 'scaleX(-1)' }}>
    <path d="M6 6.4v11.2a.9.9 0 0 0 1.4.75l8.2-5.6a.9.9 0 0 0 0-1.5L7.4 5.65A.9.9 0 0 0 6 6.4z" />
    <rect x="16.6" y="5.5" width="2.6" height="13" rx="1.1" />
  </svg>
)
export const ShuffleIcon = () => (
  <svg {...base}>
    <path d="M3 7h3.5c5 0 6 10 11 10H21M3 17h3.5c1.8 0 3-1.2 4-2.6M21 7h-3.5c-1.8 0-3 1.2-4 2.6M18.5 4.5L21 7l-2.5 2.5M18.5 14.5L21 17l-2.5 2.5" />
  </svg>
)
export const RepeatIcon = ({ one }: { one?: boolean }) => (
  <svg {...base}>
    <path d="M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3" />
    {one && <path d="M11.5 10.5l1.2-.8v5" strokeWidth={1.6} />}
  </svg>
)
export const DotsIcon = () => (
  <svg {...fill}>
    <circle cx="12" cy="5.5" r="1.9" />
    <circle cx="12" cy="12" r="1.9" />
    <circle cx="12" cy="18.5" r="1.9" />
  </svg>
)
export const MusicIcon = () => (
  <svg {...base}>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="17.5" cy="16" r="2.5" />
  </svg>
)
export const DownloadIcon = () => (
  <svg {...base}>
    <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
  </svg>
)
export const ClipIcon = () => (
  <svg {...base}>
    <path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7" />
  </svg>
)
export const GroupIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="8.5" r="3.2" />
    <path d="M5.5 19c.5-3.2 3-4.8 6.5-4.8s6 1.6 6.5 4.8" />
    <circle cx="5" cy="10" r="2.1" />
    <circle cx="19" cy="10" r="2.1" />
  </svg>
)
export const CheckIcon = () => (
  <svg {...base} strokeWidth={2.6}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)
export const MicIcon = () => (
  <svg {...base}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
  </svg>
)
export const TrashIcon = () => (
  <svg {...base}>
    <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />
  </svg>
)
export const PhoneIcon = () => (
  <svg {...base}>
    <path d="M5 4h3.5l1.7 4.3-2.1 1.4a11 11 0 0 0 5.2 5.2l1.4-2.1L19 14.5V18a2 2 0 0 1-2 2A13 13 0 0 1 3 6a2 2 0 0 1 2-2z" />
  </svg>
)
export const HangupIcon = () => (
  <svg {...base} strokeWidth={2}>
    <path d="M3 14.5c5-4.6 13-4.6 18 0l-2.2 2.6-3.3-1.2v-2.8a11 11 0 0 0-3 0v2.8l-3.3 1.2z" />
  </svg>
)
export const MicOffIcon = () => (
  <svg {...base}>
    <path d="M4 4l16 16M9 9v2a3 3 0 0 0 5 2.2M15 9.5V6a3 3 0 0 0-5.7-1.3M5.5 11a6.5 6.5 0 0 0 10.3 5.3M18.5 11a6.4 6.4 0 0 1-.7 2.9M12 17.5V21M8.5 21h7" />
  </svg>
)
export const LockIcon = () => (
  <svg {...base}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
)
export const RecordIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.2" fill="currentColor" />
  </svg>
)
export const DownIcon = () => (
  <svg {...base} strokeWidth={2.2}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)
