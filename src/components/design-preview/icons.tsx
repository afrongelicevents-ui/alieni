/* Line icons (24×24, stroke = currentColor) for the redesign. */
import type { SVGProps } from "react";

const P = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const paths = {
  arrow: <path d="M5 12h14m0 0-5-5m5 5-5 5" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  play: <path d="M9 7.5v9l7.5-4.5z" fill="currentColor" stroke="none" />,
  person: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" /></>,
  bolt: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" />,
  handshake: <><path d="m3 11 4-4 3 1 2-1 3 0 6 5" /><path d="M7 7 3.5 11.5 8 16l1.5-1.5m1.5 1.5 1.5-1.5m1.5 1.5 1.5-1.5m1.5 1.5L21 12" /><path d="m10 9 3 3m1-3 3 3" /></>,
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  home: <><path d="M4 11 12 4l8 7" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></>,
  building: <><rect x="5" y="3.5" width="14" height="17" rx="1" /><path d="M9 7.5h2m2 0h2M9 11h2m2 0h2M9 14.5h2m2 0h2M10.5 20.5v-3h3v3" /></>,
  box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4m0 13.6v2.4M2.8 12h2.4m13.6 0h2.4M5.5 5.5l1.7 1.7m9.6 9.6 1.7 1.7m0-13-1.7 1.7m-9.6 9.6-1.7 1.7" /></>,
  briefcase: <><rect x="3.5" y="7" width="17" height="12.5" rx="2" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17" /></>,
  grid: <><circle cx="6" cy="6" r="1.4" fill="currentColor" /><circle cx="12" cy="6" r="1.4" fill="currentColor" /><circle cx="18" cy="6" r="1.4" fill="currentColor" /><circle cx="6" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="18" cy="12" r="1.4" fill="currentColor" /><circle cx="6" cy="18" r="1.4" fill="currentColor" /><circle cx="12" cy="18" r="1.4" fill="currentColor" /><circle cx="18" cy="18" r="1.4" fill="currentColor" /></>,
  users: <><circle cx="9" cy="8.5" r="3" /><circle cx="16.5" cy="9.5" r="2.4" /><path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5M14.5 14.3c.6-.2 1.3-.3 2-.3 2.2 0 3.7 1.5 4 4" /></>,
  scale: <><path d="M12 4v16M7 20h10M5 7h14" /><path d="m5 7-2.5 6a2.5 2.5 0 0 0 5 0zm14 0-2.5 6a2.5 2.5 0 0 0 5 0z" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4m8-4v4" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  linkedin: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M8 10.5V16m0-8.2v.2m3.5 8V10.5m0 2.5c0-1.5 1-2.5 2.3-2.5S16 11.3 16 13v3" /></>,
  instagram: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17" cy="7" r=".6" fill="currentColor" /></>,
  facebook: <path d="M14 8.5h2.5V5H14a3.5 3.5 0 0 0-3.5 3.5V11H8v3.5h2.5V21H14v-6.5h2.5L17 11h-3V9a.5.5 0 0 1 .5-.5z" />,
  shield: <><path d="M12 3 5 6v5.5c0 4.3 3 7.6 7 9.5 4-1.9 7-5.2 7-9.5V6z" /><path d="m9 12 2 2 4-4" /></>,
  chat: <path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 5z" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, className = "h-6 w-6", ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...P} {...rest}>
      {paths[name]}
    </svg>
  );
}
