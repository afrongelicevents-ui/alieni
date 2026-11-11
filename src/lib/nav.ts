/** Role-specific navigation (shared by the header and the mobile menu). */
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
    { href: "/business/requests", key: "requests", icon: "jobs" },
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
