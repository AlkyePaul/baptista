import Image from "next/image";
import type { IconName } from "@/lib/rooms";
import { expressionSrc } from "@/lib/baptista/expressions";

const IMAGE_PATHS: Partial<Record<IconName, string>> = {
  home: "/icons/general-icon/home.png",
  sofa: "/icons/general-icon/home.png",
  habit: "/icons/general-icon/habit.png",
  calendar: "/icons/general-icon/calendar.png",
  target: "/icons/general-icon/objective.png",
  cutlery: "/icons/food-icon/pot.png",
  pantry: "/icons/food-icon/groceries.png",
  diet: "/icons/food-icon/meal-tracking.png",
  food: "/icons/food-icon/fruit-veg.png",
  meals: "/icons/food-icon/pasti.png",
  piggybank: "/icons/finance-icon/growth.png",
  coins: "/icons/finance-icon/expenses.png",
  chart: "/icons/finance-icon/trend.png",
  assistant: expressionSrc("suggestion"),
};

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
  "type-top": (
    <>
      {/* t-shirt */}
      <path d="M8 4h8l3 3-2 2-2-1.5V20H9V7.5L7 9 5 7z" />
    </>
  ),
  "type-knitwear": (
    <>
      {/* sweater with ribbed collar */}
      <path d="M8 4h8l3 3-2 2-2-1.5V20H9V7.5L7 9 5 7z" />
      <path d="M8 4c0 1.5 1.5 2.5 4 2.5S16 5.5 16 4" />
      <path d="M9 14h6M9 17h6" />
    </>
  ),
  "type-bottom": (
    <>
      {/* trousers */}
      <path d="M7 4h10v4l-1 12h-3l-1-8-1 8H8L7 8z" />
    </>
  ),
  "type-dress": (
    <>
      {/* dress silhouette */}
      <path d="M9 3h6l1 4-2 1 2 5v4c0 1-1 3-4 3s-4-2-4-3v-4l2-5-2-1z" />
    </>
  ),
  "type-outerwear": (
    <>
      {/* jacket */}
      <path d="M8 3h8l3 4-2 2-1-1v12H8V8L7 9 5 7z" />
      <path d="M12 3v17" />
    </>
  ),
  "type-shoes": (
    <>
      {/* shoe side view */}
      <path d="M4 16c0-2 1-4 3-5l4-2c2-1 4-1 6 0l3 2a2 2 0 0 1 1 2v1a2 2 0 0 1-2 2H4z" />
      <path d="M7 11v3" />
    </>
  ),
  "type-accessory": (
    <>
      {/* sunglasses */}
      <circle cx="7.5" cy="13" r="3" />
      <circle cx="16.5" cy="13" r="3" />
      <path d="M10.5 13h3" />
      <path d="M4.5 12 3 10M19.5 12 21 10" />
    </>
  ),
  "type-sportswear": (
    <>
      {/* tank top / running top */}
      <path d="M8 4h8v1l-1 1v14H9V6L8 5z" />
      <path d="M8 4c-1.5.5-2 2-2 3l2 1M16 4c1.5.5 2 2 2 3l-2 1" />
    </>
  ),
  "type-underwear": (
    <>
      {/* briefs */}
      <path d="M6 6h12v4c0 3-2 7-3 8h-2l-1-4-1 4H9c-1-1-3-5-3-8z" />
    </>
  ),
  "type-other": (
    <>
      {/* ellipsis dots */}
      <circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  star: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14 2 9.27l6.91-1.01z" />,
  "star-filled": <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14 2 9.27l6.91-1.01z" fill="currentColor" />,
  grip: (
    <>
      <circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  "chevron-right": <path d="M9 6l6 6-6 6" />,
  "chevron-left": <path d="M15 6l-6 6 6 6" />,
  "chevron-down": <path d="M6 9l6 6 6-6" />,
  "chevron-up": <path d="M6 15l6-6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  repeat: (
    <>
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </>
  ),
  skip: (
    <>
      <path d="M5 4l10 8-10 8z" />
      <path d="M19 5v14" />
    </>
  ),
  food: <path d="M12 21V9M12 13c-4 0-7-3-7-7 4 0 7 3 7 7ZM12 16c4 0 7-3 7-7-4 0-7 3-7 7Z" />,
  meals: <path d="M4 4v16M9 4v16M4 10h5M16 4v16M16 4c3 2 4 5 4 8h-4" />,
};

export function Icon({ name, className = "size-6" }: { name: IconName; className?: string }) {
  const src = IMAGE_PATHS[name];
  if (src) return <Image src={src} alt="" aria-hidden width={32} height={32} className={`${className} object-contain`} />;
  return (
    <svg {...base} className={className}>
      {PATHS[name]}
    </svg>
  );
}
