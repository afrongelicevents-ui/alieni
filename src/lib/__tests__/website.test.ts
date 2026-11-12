import { describe, expect, it } from "vitest";
import { videoEmbedUrl } from "../video";

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
