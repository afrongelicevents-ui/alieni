# Design review — step 1 (website only)

Side-by-side: `compare-desktop.png` (1440px) and `compare-mobile.png` (390px).
Full-page captures: `desktop-full.webp`, `mobile-full.webp`.

Live previews (dev only, 404 in production unless `DESIGN_PREVIEW=1`, noindex):
- `/design-preview/desktop`, `/design-preview/mobile-web` (NL)
- `/en/design-preview/desktop`, `/en/design-preview/mobile-web` (EN)

The mobile app (design 3) is out of scope for now.

## Removing the "made by AI" look (round 2)

Done in the preview:
- Copy uses real Alieni facts (from the build tracker) instead of slogans:
  free for cleaners, from €15/hour, €14.95/month only after a deal,
  contact details hidden until both confirm, no addresses stored.
- "Find trusted cleaners" → "independent cleaners" (we don't verify).
- Fake night-city skyline removed (not a Dutch city, obviously generated).
- "Together for a Cleaner Tomorrow" → "Cleaning sorted, no middleman."
- Fewer template tells: no glowing buttons, no icon-in-a-bubble grids,
  fewer eyebrow labels, left-aligned headings, borders instead of soft shadows.

Still AI-generated (needs real photos — build tracker item D2):
- Hero cleaner cut-out, About photo, the six category photos.
  Swap them in `src/lib/design-images.ts` or via Admin → Foto's.
