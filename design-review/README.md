# Website redesign — review notes

Screenshots of the live homepage (production build): `home-nl-{390,834,1440}.webp`
and `home-en-{390,834,1440}.webp`.

## Photo credits

All photos are real stock photos from **Pexels**. The [Pexels licence](https://www.pexels.com/license/)
allows free commercial use; attribution is not required but is kept here. No AI-generated images
are used on the site anymore. The photos were downloaded at 2000 px, cropped to each slot and saved as WebP.

| Where on the site | File | Photo | Photographer |
|---|---|---|---|
| Homepage hero (background removed, name badge blurred) | `public/img/site/hero-cleaner-cutout.webp`, `public/img/hero-cleaner.webp` | https://www.pexels.com/photo/9462192/ | Liliana Drew ¹ |
| Homepage hero background (blurred) | `public/img/site/hero-interior.webp` | https://www.pexels.com/photo/interior-of-a-modern-minimalist-living-room-19836798/ | Lisa Anna |
| About block (mobile) | `public/img/site/about-living.webp` | https://www.pexels.com/photo/person-cleaning-the-handle-of-a-cabinet-9462229/ | Liliana Drew |
| Card: Find cleaners | `public/img/site/cat-find-cleaners.webp` | https://www.pexels.com/photo/woman-cleaning-table-with-fiber-cloth-9462732/ | Liliana Drew |
| Card: Cleaning companies | `public/img/site/cat-companies.webp` | https://www.pexels.com/photo/6196238/ | Tima Miroshnichenko ¹ |
| Card: Suppliers & equipment | `public/img/site/cat-suppliers.webp` | https://www.pexels.com/photo/cleaning-materials-on-white-surface-4440525/ | Polina Tankilevitch |
| Card: Linen & laundry | `public/img/site/cat-linen.webp` | https://www.pexels.com/photo/white-towels-on-white-table-7691101/ | Roman Odintsov |
| Card: Jobs & opportunities | `public/img/site/cat-jobs.webp` | https://www.pexels.com/photo/6197116/ | Tima Miroshnichenko ¹ |
| Card: Cleaning services (commercial) | `public/img/site/cat-commercial.webp` | https://www.pexels.com/photo/modern-office-interior-with-desks-and-plants-33827332/ | Capture Crew |
| Closing banner (Amsterdam canal) | `public/img/site/dutch-street.webp` | https://www.pexels.com/photo/houses-along-the-canal-in-amsterdam-the-netherlands-18744171/ | Lara Farber |
| Business page: Airbnb | `public/img/business-airbnb.webp` | https://www.pexels.com/photo/photo-of-bedroom-3705537/ | Alexander Zvir |
| Business page: Hotel | `public/img/business-hotel.webp` | https://www.pexels.com/photo/interior-of-bright-room-in-hotel-6186819/ | Max Vakhtbovych |
| Business page: Office | `public/img/business-office.webp` | https://www.pexels.com/photo/contemporary-office-with-glass-doors-and-new-furniture-7534175/ | Max Vakhtbovych |
| Business page: School | `public/img/business-school.webp` | https://www.pexels.com/photo/desks-and-chairs-in-classroom-8500630/ | RDNE Stock project |
| Business page: Restaurant | `public/img/business-restaurant.webp` | https://www.pexels.com/photo/interior-on-spacious-classy-restaurant-with-arches-in-daylight-5490921/ | Rachel Claire |

¹ Pexels' photo pages block automated access, so these three names come from search results for the same
photo shoot (same photographer's confirmed photos with neighbouring IDs). Open the link to confirm before
crediting publicly.

Spare option for the hero: https://www.pexels.com/photo/9462206/ (same shoot; its name badge would need blurring).

All paths live in `src/lib/design-images.ts` (homepage) and the Admin → Photos fallbacks in `public/img/`.
Replace them with our own photo shoot later, keeping the file names and aspect ratios.

## Copy rules kept from the brief

- No "trusted / vetted / verified" claims, no "24/7 support", no user numbers, no invented testimonials.
- Headline (as approved on the design branch): "Find a cleaner near you. Meet first, then decide." /
  "Vind een schoonmaker bij jou in de buurt. Eerst kennismaken, dan beslissen."
- Prices follow alieni-dev's rule (flow13): the household price line appears only while charging is active
  (`getPublicHouseholdFeeCents`) and reads exactly as designed then; while nothing is charged it says
  "Searching and meeting are free". The minimum hourly rate is read from Admin → Settings and shown as an
  hourly rate ("From €15/hr"), never as a fixed price.

## Database

`supabase/migrations/0029_website_content.sql` — testimonials, "Notify me" sign-ups and two new settings keys.
Additive and idempotent; it does not change 0001–0028.
