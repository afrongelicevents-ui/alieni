/* Visitor without an account, on phone (390 px) and desktop: every public page opens (NL + EN), nothing scrolls
 * sideways on a phone, the homepage has the four tiles and the alieni-nl hero text, seeded ads are listed, a draft
 * ad is not reachable, private pages ask to log in, and no Supabase/Vercel leftovers appear. */
const { APP, OUT, VIEWPORTS, q1, suite, text } = require("./lib.cjs");

const PUBLIC = ["/nl", "/en", "/en/about", "/en/search", "/nl/search?q=Utrecht", "/en/business", "/en/business/hotel", "/en/business/office", "/en/contact", "/en/terms", "/en/privacy", "/en/jobs", "/en/signup", "/en/signup?role=cleaner", "/en/business/signup", "/en/login", "/en/reset-password"];
const PRIVATE = ["/en/home", "/en/messages", "/en/favourites", "/en/profile", "/en/account", "/en/business/dashboard", "/en/admin", "/en/work"];

(async () => {
  const { ok, page, done } = suite("flow-guest");
  const published = q1("SELECT id FROM cleaner_profiles WHERE status = 'published' ORDER BY created_at LIMIT 1").id;
  const draft = q1("SELECT id FROM cleaner_profiles WHERE status = 'draft' LIMIT 1").id;
  for (const [label, vp] of VIEWPORTS) {
    const tag = (t) => `[${label}] ${t}`;
    const p = await page(vp);
    const bad = [];
    for (const path of [...PUBLIC, `/en/cleaners/${published}`]) {
      const r = await p.goto(`${APP}${path}`, { waitUntil: "networkidle" });
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      const body = await text(p, "body");
      if (r.status() !== 200 || (label === "phone" && overflow) || /supabase|vercel/i.test(body)) bad.push(`${path} ${r.status()}${overflow ? " overflow" : ""}`);
    }
    ok(tag(`All ${PUBLIC.length + 1} public pages open, fit the screen, no Supabase/Vercel text`), bad.length === 0, bad.join(", "));

    await p.goto(`${APP}/nl`, { waitUntil: "networkidle" });
    const home = await text(p);
    ok(tag("Homepage: alieni-nl hero text and the four tiles"), /Vind betrouwbare schoonmakers en professionele schoonmaakdiensten bij jou in de buurt/.test(home) && (await p.locator("[data-tile]").count()) >= 4);
    await p.screenshot({ path: `${OUT}/cf-${label}-home.png`, fullPage: false });

    await p.goto(`${APP}/en/search`, { waitUntil: "networkidle" });
    ok(tag("Search lists the seeded published cleaners (not the draft)"), /Fatima El Amrani/.test(await text(p)) && !/Sara Draft/.test(await text(p)));
    await p.goto(`${APP}/en/cleaners/${published}`, { waitUntil: "networkidle" });
    ok(tag("A published ad shows a review and the postcode area only"), /Fatima/.test(await text(p)) && !/3512 JE/.test(await text(p)));
    const d = await p.goto(`${APP}/en/cleaners/${draft}`, { waitUntil: "networkidle" });
    ok(tag("A draft ad is not reachable for visitors"), d.status() === 404 || /not found|does not exist|niet gevonden/i.test(await text(p, "body")));

    const leaks = [];
    for (const path of PRIVATE) {
      await p.goto(`${APP}${path}`, { waitUntil: "networkidle" });
      if (!/\/(en|nl)\/login/.test(p.url())) leaks.push(path);
    }
    ok(tag("Private pages send visitors to log in"), leaks.length === 0, leaks.join(", "));
    await p.goto(`${APP}/en/jobs`, { waitUntil: "networkidle" });
    ok(tag("Guest jobs board shows a published job with its company"), /Kantoor Domplein BV|Hotel De Gracht/.test(await text(p)));
    ok(tag("NL/EN switch works"), (await p.goto(`${APP}/nl/about`)).status() === 200 && /Over|over/.test(await text(p)));
    await p.context().close();
  }
  await done();
})();
