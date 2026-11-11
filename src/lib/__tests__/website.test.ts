import { describe, expect, it } from "vitest";
import { DEFAULT_MODULES, moduleHref, parseModules, safeModuleUrl } from "../site-modules";
import { videoEmbedUrl } from "../video";

describe("website modules", () => {
  it("defaults to Coming soon for every module", () => {
    expect(Object.values(DEFAULT_MODULES).every((m) => !m.live)).toBe(true);
    expect(moduleHref("suppliers", DEFAULT_MODULES.suppliers)).toBe("/notify/suppliers");
  });
  it("links a live module to its page", () => {
    const mods = parseModules({ careers: { live: true, url: "/jobs" } });
    expect(moduleHref("careers", mods.careers)).toBe("/jobs");
  });
  it("never goes live without a page, and only accepts same-site paths", () => {
    expect(parseModules({ suppliers: { live: true, url: "" } }).suppliers.live).toBe(false);
    expect(parseModules({ suppliers: { live: true, url: "https://evil.example" } }).suppliers.live).toBe(false);
    expect(safeModuleUrl("//evil.example")).toBe("");
    expect(safeModuleUrl("javascript:alert(1)")).toBe("");
    expect(safeModuleUrl("/jobs?type=office")).toBe("/jobs?type=office");
  });
  it("ignores garbage settings", () => {
    expect(parseModules("nonsense")).toEqual(DEFAULT_MODULES);
    expect(parseModules(null)).toEqual(DEFAULT_MODULES);
  });
});

describe("homepage video", () => {
  it("turns YouTube and Vimeo links into privacy-friendly embeds", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0");
    expect(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbedUrl("https://vimeo.com/76979871")).toBe("https://player.vimeo.com/video/76979871?autoplay=1&dnt=1");
  });
  it("refuses anything else", () => {
    expect(videoEmbedUrl("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(videoEmbedUrl("https://example.com/video.mp4")).toBeNull();
    expect(videoEmbedUrl("not a url")).toBeNull();
  });
});
