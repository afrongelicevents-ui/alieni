/* Public vs private pages for a logged-out visitor (phone + desktop):
 *  1. the homepage (/, /nl, /en) and every public page open without logging in — the hero is visible on a phone;
 *     also with a leftover (broken) login cookie or a session that was ended elsewhere, in a fresh tab,
 *     and tapping the Alieni logo stays on the homepage
 *  2. private pages (dashboards, chats, bookings, admin, account) send you to log in, with a return path
 *  3. after logging in you land on the page you wanted
 *  4. "Log in" / "Get started" only open the login / sign-up page when tapped
 * App on :3100 (or APP). */
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const APP = process.env.APP || "http://localhost:3100";
const EMU = "http://localhost:4000";
const OUT = process.env.E2E_OUT || "e2e/out";
const results = [];
function ok(name, pass, detail = "") { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); }
const path = (page) => { const u = new URL(page.url()); return u.pathname + u.search; };
const onLogin = (page) => /\/login(\?|$)/.test(new URL(page.url()).pathname + "?");

const PUBLIC = ["/", "/nl", "/en", "/en/about", "/en/contact", "/en/search", "/en/business", "/en/business/hotel", "/en/terms", "/en/privacy", "/en/jobs"];
const PRIVATE = [
  ["/en/home", "/home"], ["/en/account", "/account"], ["/en/messages", "/messages"], ["/en/favourites", "/favourites"],
  ["/en/business/dashboard", "/business/dashboard"], ["/en/jobs/new", "/jobs/new"], ["/en/admin", "/admin"],
];

(async () => {
  await fetch(`${EMU}/__emu/reset`);
  const browser = await chromium.launch();
  const errors = [];
  const track = (p) => {
    p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  };

  for (const [label, opts] of [["phone", devices["iPhone 13"]], ["desktop", { viewport: { width: 1280, height: 900 } }]]) {
    // ---------- 1. homepage + public pages, logged out ----------
    const ctx = await browser.newContext(opts);
    const g = await ctx.newPage(); track(g);
    for (const u of ["/", "/nl", "/en"]) {
      const res = await g.goto(`${APP}${u}`, { waitUntil: "networkidle" });
      const h1 = (await g.locator("main h1").first().textContent().catch(() => "")) || "";
      const heroImg = await g.locator("main section img[alt]:not([alt=''])").first().isVisible().catch(() => false);
      ok(`[${label}] logged-out visitor opens ${u} and sees the hero`, res.status() === 200 && !onLogin(g) && /cleaner|schoonmaker/i.test(h1) && heroImg, `${res.status()} ${path(g)} "${h1.trim()}"`);
    }
    if (label === "phone") await g.screenshot({ path: `${OUT}/f14-m-home-logged-out.png` });

    const bad = [];
    for (const u of PUBLIC) {
      const res = await g.goto(`${APP}${u}`, { waitUntil: "domcontentloaded" });
      if (res.status() !== 200 || onLogin(g)) bad.push(`${u} → ${res.status()} ${path(g)}`);
    }
    // a public cleaner profile, if the search lists one
    await g.goto(`${APP}/en/search`, { waitUntil: "networkidle" });
    const profile = await g.locator("a[href*='/cleaners/']").first().getAttribute("href").catch(() => null);
    if (profile) { const res = await g.goto(`${APP}${profile}`, { waitUntil: "domcontentloaded" }); if (res.status() !== 200 || onLogin(g)) bad.push(`${profile} → ${res.status()} ${path(g)}`); }
    ok(`[${label}] all public pages open without logging in${profile ? " (incl. a cleaner profile)" : ""}`, bad.length === 0, bad.join(" | "));

    // logo tap stays on the homepage
    await g.goto(`${APP}/en/about`, { waitUntil: "networkidle" });
    await g.locator("header a[aria-label='Alieni — home']").first().click();
    await g.waitForURL((url) => /^\/en\/?$/.test(url.pathname), { timeout: 10000 }).catch(() => {});
    ok(`[${label}] tapping the Alieni logo opens the homepage, not login`, /^\/en\/?$/.test(new URL(g.url()).pathname) && !onLogin(g), path(g));

    // ---------- 4. Log in / Get started only when tapped ----------
    await g.goto(`${APP}/en`, { waitUntil: "networkidle" });
    await g.waitForTimeout(1500);
    ok(`[${label}] the homepage stays put (no automatic jump to login/sign-up)`, new URL(g.url()).pathname === "/en", path(g));
    await g.locator("header").getByRole("link", { name: "Get started" }).first().click();
    await g.waitForURL(/\/en\/signup/, { timeout: 10000 }).catch(() => {});
    ok(`[${label}] tapping "Get started" opens sign-up`, /\/en\/signup/.test(g.url()), path(g));
    await g.goto(`${APP}/en`, { waitUntil: "networkidle" });
    if (label === "phone") {
      await g.getByRole("button", { name: "Open menu" }).click();
      await g.locator("#mobile-menu").getByRole("link", { name: "Log in" }).click();
    } else {
      await g.locator("header").getByRole("link", { name: "Log in" }).first().click();
    }
    await g.waitForURL(/\/en\/login/, { timeout: 10000 }).catch(() => {});
    ok(`[${label}] tapping "Log in" opens the login page`, /\/en\/login/.test(g.url()), path(g));

    // ---------- 2. private pages → login with a return path ----------
    const wrong = [];
    for (const [u, next] of PRIVATE) {
      await g.goto(`${APP}${u}`, { waitUntil: "domcontentloaded" });
      const url = new URL(g.url());
      if (url.pathname !== "/en/login" || url.searchParams.get("next") !== next) wrong.push(`${u} → ${path(g)}`);
    }
    ok(`[${label}] private pages ask to log in and remember where you were going`, wrong.length === 0, wrong.join(" | "));
    await ctx.close();

    // ---------- 1b. a leftover, broken login cookie does not lock anyone out ----------
    const sctx = await browser.newContext(opts);
    await sctx.addCookies([{ name: "sb-localhost-auth-token", value: "base64-" + Buffer.from(JSON.stringify({ access_token: "expired", refresh_token: "gone" })).toString("base64"), url: APP }]);
    const s = await sctx.newPage(); track(s);
    const sres = await s.goto(`${APP}/en`, { waitUntil: "networkidle" });
    const sh1 = (await s.locator("main h1").first().textContent().catch(() => "")) || "";
    ok(`[${label}] with an expired login cookie the homepage still opens with the hero`, sres.status() === 200 && !onLogin(s) && /cleaner/i.test(sh1), path(s));
    await s.goto(`${APP}/en/about`, { waitUntil: "networkidle" });
    await s.locator("header a[aria-label='Alieni — home']").first().click();
    await s.waitForURL((url) => /^\/en\/?$/.test(url.pathname), { timeout: 10000 }).catch(() => {});
    ok(`[${label}] with an expired login cookie the logo still opens the homepage`, /^\/en\/?$/.test(new URL(s.url()).pathname) && !onLogin(s), path(s));
    await sctx.close();

    // ---------- 1c. a real session that was ended elsewhere (logout on another device, password change, clean-up) ----------
    // Supabase Auth then refuses the session while the access token still looks valid for up to an hour.
    const ectx = await browser.newContext(opts);
    const e = await ectx.newPage(); track(e);
    const eEmail = `f14.ended.${label}@example.com`;
    await e.goto(`${APP}/en/signup?role=household`, { waitUntil: "networkidle" });
    await e.fill("input[type=email]", eEmail);
    const eName = e.locator("input[autocomplete='given-name']");
    if (await eName.count()) await eName.fill("Ended");
    await e.fill("input[type=password]", "Test-Password-123");
    await e.getByRole("button", { name: "Create account" }).click();
    await e.waitForURL(/\/en\/home$/, { timeout: 15000 });
    await e.close();
    await fetch(`${EMU}/__emu/revoke?email=${encodeURIComponent(eEmail)}`);
    for (const start of ["/", "/en"]) {
      const t = await ectx.newPage(); track(t); // a fresh tab
      const res = await t.goto(`${APP}${start}`, { waitUntil: "networkidle" });
      const th1 = (await t.locator("main h1").first().textContent().catch(() => "")) || "";
      ok(`[${label}] session ended elsewhere: a fresh tab on ${start} opens the homepage with the hero`, res.status() === 200 && !onLogin(t) && /cleaner|schoonmaker/i.test(th1), path(t));
      await t.goto(`${APP}/en/about`, { waitUntil: "networkidle" });
      await t.locator("header a[aria-label='Alieni — home']").first().click();
      await t.waitForURL((url) => /^\/en\/?$/.test(url.pathname), { timeout: 10000 }).catch(() => {});
      ok(`[${label}] session ended elsewhere: the logo opens the homepage (${start})`, /^\/en\/?$/.test(new URL(t.url()).pathname) && !onLogin(t), path(t));
      await t.close();
    }
    await ectx.close();

    // ---------- 3. after logging in you return to the page you wanted ----------
    const lctx = await browser.newContext(opts);
    const l = await lctx.newPage(); track(l);
    const email = `f14.${label}@example.com`;
    await l.goto(`${APP}/en/signup?role=household`, { waitUntil: "networkidle" });
    await l.fill("input[type=email]", email);
    const name = l.locator("input[autocomplete='given-name']");
    if (await name.count()) await name.fill("Fourteen");
    await l.fill("input[type=password]", "Test-Password-123");
    await l.getByRole("button", { name: "Create account" }).click();
    await l.waitForURL(/\/en\/(home|profile|admin|business\/dashboard)$/, { timeout: 15000 });
    await l.goto(`${APP}/en/account`, { waitUntil: "networkidle" });
    await l.getByRole("button", { name: "Log out" }).click();
    await l.waitForURL(/\/en\/?$/, { timeout: 10000 }).catch(() => {});
    for (const [u, next] of [["/en/favourites", "/en/favourites"], ["/en/messages", "/en/messages"]]) {
      await l.goto(`${APP}${u}`, { waitUntil: "networkidle" });
      const asked = new URL(l.url()).pathname === "/en/login";
      if (!asked) { ok(`[${label}] ${u}: log in, then back on the page you wanted`, false, `not sent to login: ${path(l)}`); continue; }
      await l.fill("input[type=email]", email);
      await l.fill("input[type=password]", "Test-Password-123");
      await l.getByRole("button", { name: "Log in" }).click();
      await l.waitForURL((url) => url.pathname === next, { timeout: 15000 }).catch(() => {});
      ok(`[${label}] ${u}: log in, then back on the page you wanted`, asked && new URL(l.url()).pathname === next, path(l));
      await l.goto(`${APP}/en/account`, { waitUntil: "networkidle" });
      await l.getByRole("button", { name: "Log out" }).click();
      await l.waitForURL(/\/en\/?$/, { timeout: 10000 }).catch(() => {});
    }
    await lctx.close();
  }

  ok("No unexpected browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/flow14-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
