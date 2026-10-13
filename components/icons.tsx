import type { IconName } from "@/lib/rooms";

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const PATHS: Record<IconName, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  assistant: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  habit: (
    <>
      <path d="M21 12a9 9 0 1 1-9-9" />
      <path d="M21 3v6h-6" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  add: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" strokeWidth={2.4} />
    </>
  ),
  sofa: (
    <>
      <path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" />
      <path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M6 19v2M18 19v2" />
    </>
  ),
  cutlery: (
    <>
      <path d="M6 3v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M8 3v18" />
      <path d="M17 21V3c-2 1.5-3 4-3 7s1 4 3 4" />
    </>
  ),
  piggybank: (
    <>
      <path d="M19 10.5c1 .5 2 1.5 2 2.5M5 11a7 6 0 0 1 12-2.5h1.5L18 11a5 5 0 0 1 1 3c0 1.5-1 2.5-2 3v3h-3v-2h-4v2H7v-3a6 6 0 0 1-2-5z" />
      <path d="M10 6.5a2 2 0 1 1 3 0" />
      <path d="M15.5 12h.01" strokeWidth={2.6} />
    </>
  ),
  wardrobe: (
    <>
      {/* dress */}
      <path d="M5.5 3h3l-.5 3 2.5 7.5h-7L6 6z" />
      <path d="M4 13.5 3 21h8l-1-7.5" />
      {/* trousers */}
      <path d="M14 3h7l.5 18h-3L17.5 10 16.5 21h-3z" />
    </>
  ),
  pantry: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M4 12h16M9 7.5h6M9 16.5h6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="9" cy="7" rx="6" ry="3" />
      <path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7" />
      <path d="M9 17c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.6-2.4-2.9-5.5-3" />
    </>
  ),
  hanger: (
    <>
      <path d="M12 7a2 2 0 1 1 2-2" />
      <path d="M12 7v2L3 16a1 1 0 0 0 .6 1.8h16.8A1 1 0 0 0 21 16l-9-7" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" />
      <path d="M8 8h.01" strokeWidth={2.6} />
    </>
  ),
  diet: (
    <>
      {/* apple */}
      <path d="M12 7c-1.5-1.2-5-1.5-6.5 1.5S5 16 7 18.5 10.5 21 12 20c1.5 1 3 1 5-1.5s2-7 .5-10S13.5 5.8 12 7z" />
      <path d="M12 7c0-2 1-3.5 3-4" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 12h.01" strokeWidth={2.8} />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="m7 15 4-5 3 3 5-7" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  outfit: (
    <>
      {/* top on hanger + bottom */}
      <path d="M9 3h6M12 3v2" />
      <path d="M7 5l-2 4h3v4h8V9h3l-2-4" />
      <path d="M8 13v3l1 5h2.5l.5-3 .5 3H15l1-5v-3" />
    </>
  ),
};

export function Icon({ name, className = "size-6" }: { name: IconName; className?: string }) {
  return (
    <svg {...base} className={className}>
      {PATHS[name]}
    </svg>
  );
}
