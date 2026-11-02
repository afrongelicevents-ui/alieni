/** Role-specific navigation (shared by header, bottom bar and mobile menu). */
export type NavRole = "guest" | "household" | "cleaner" | "business" | "admin";
export type NavItem = { href: string; key: string; icon: "home" | "search" | "jobs" | "heart" | "chat" | "user" | "grid" | "briefcase" };

export const NAV: Record<NavRole, NavItem[]> = {
  guest: [
    { href: "/", key: "home", icon: "home" },
    { href: "/search", key: "search", icon: "search" },
    { href: "/jobs", key: "jobs", icon: "jobs" },
    { href: "/business", key: "forBusiness", icon: "briefcase" },
    { href: "/login", key: "login", icon: "user" },
  ],
  household: [
    { href: "/home", key: "home", icon: "home" },
    { href: "/search", key: "find", icon: "search" },
    { href: "/messages", key: "messages", icon: "chat" },
    { href: "/favourites", key: "favourites", icon: "heart" },
    { href: "/account", key: "account", icon: "user" },
  ],
  cleaner: [
    { href: "/home", key: "home", icon: "home" },
    { href: "/work", key: "work", icon: "jobs" },
    { href: "/messages", key: "messages", icon: "chat" },
    { href: "/profile", key: "profile", icon: "user" },
    { href: "/account", key: "account", icon: "grid" },
  ],
  business: [
    { href: "/business/dashboard", key: "dashboard", icon: "grid" },
    { href: "/search", key: "cleaners", icon: "search" },
    { href: "/jobs", key: "jobs", icon: "jobs" },
    { href: "/messages", key: "messages", icon: "chat" },
    { href: "/account", key: "account", icon: "user" },
  ],
  admin: [
    { href: "/admin", key: "admin", icon: "grid" },
    { href: "/search", key: "find", icon: "search" },
    { href: "/messages", key: "messages", icon: "chat" },
    { href: "/jobs", key: "jobs", icon: "jobs" },
    { href: "/account", key: "account", icon: "user" },
  ],
};

export const ICON_PATHS: Record<NavItem["icon"], string> = {
  home: "M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm9.5 3-4.9-4.9",
  jobs: "M4 8h16v11H4V8Zm5 0V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 12h16",
  heart: "M12 20s-7.5-4.6-9.3-9A5 5 0 0 1 12 6.4 5 5 0 0 1 21.3 11c-1.8 4.4-9.3 9-9.3 9Z",
  chat: "M4 5h16v11H9l-5 4V5Z",
  user: "M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-7 9a7 7 0 0 1 14 0",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  briefcase: "M3 8h18v11H3zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2",
};
