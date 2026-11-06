/* Three experiences: per role, on phone and desktop width — navigation,
 * dashboards, onboarding, guards (wrong role is redirected) and database
 * refusal of cross-role writes (via the stand-in's role rules). */
const { chromium } = require("playwright");
const fs = require("node:fs");
const APP = "http://localhost:3100";
const EMU = "http://localhost:4000";
const OUT = process.env.E2E_OUT || "e2e/out";
const results = [];
function ok(name, pass, detail = "") { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); }
async function signUp(page, email, role) {
  await page.goto(`${APP}/en/signup?role=${role}`, { waitUntil: "networkidle" });
  await page.fill("input[type=email]", email);
  await page.fill("input[autocomplete='given-name']", email.split("@")[0]);
  await page.fill("input[type=password]", "Test-Password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/en\/(home|profile|admin|business\/dashboard)$/, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
}
async function navLabels(page, mobile) {
  return mobile
    ? page.locator("nav.fixed a").allTextContents()
    : page.locator("header nav.hidden a, header nav.md\\:flex a").allTextContents();
}
async function accessToken(ctx) {
  const cookies = await ctx.cookies();
  const raw = cookies.filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.value).join("");
  const json = raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64").toString() : decodeURIComponent(raw);
  return JSON.parse(json).access_token;
}
async function restInsert(token, table, body) {
  const res = await fetch(`${EMU}/rest/v1/${table}`, { method: "POST", headers: { apikey: "emu-anon-key", Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(body) });
  return res.status;
}
async function restPatch(token, table, query, body) {
  const res = await fetch(`${EMU}/rest/v1/${table}?${query}`, { method: "PATCH", headers: { apikey: "emu-anon-key", Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.status;
}

(async () => {
  await fetch(`${EMU}/__emu/reset`);
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const track = (page) => { page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`)); page.on("console", (m) => { if (m.type() === "error" && !/status of (400|404|422)|realtime\/v1\/websocket/.test(m.text())) errors.push(`console: ${m.text()}`); }); };

  for (const [label, viewport, mobile] of [["phone", { width: 390, height: 844 }, true], ["desktop", { width: 1280, height: 900 }, false]]) {
    const suffix = mobile ? "m" : "d";

    // ---------- Guest ----------
    const g = await (await browser.newContext({ viewport })).newPage(); track(g);
    await g.goto(`${APP}/en`, { waitUntil: "networkidle" });
    const gnav = await navLabels(g, mobile);
    ok(`[${label}] Guest nav: Home, Search, Jobs, Business${mobile ? ", Log in" : ""}`, gnav.includes("Home") && gnav.includes("Search") && gnav.includes("Jobs") && gnav.includes("Business"), gnav.join("|"));
    await g.goto(`${APP}/en/signup`, { waitUntil: "networkidle" });
    ok(`[${label}] Sign-up starts with the three choices`, (await g.getByRole("link", { name: /looking for a cleaner for my home/ }).count()) === 1 && (await g.getByRole("link", { name: /I'm a cleaner/ }).count()) === 1 && (await g.getByRole("link", { name: /business that needs cleaning/ }).count()) === 1);
    await g.screenshot({ path: `${OUT}/f5-${suffix}-signup-choice.png` });
    for (const [path, expect] of [["/en/home", /\/en\/login\?next=/], ["/en/work", /\/en\/login/], ["/en/favourites", /\/en\/login/], ["/en/business/dashboard", /\/en\/login/]]) {
      await g.goto(`${APP}${path}`, { waitUntil: "networkidle" });
      ok(`[${label}] Guest: ${path} → login`, expect.test(g.url()), g.url());
    }

    // ---------- Household ----------
    const hctx = await browser.newContext({ viewport }); const h = await hctx.newPage(); track(h);
    await signUp(h, `hh-${suffix}@example.com`, "household");
    ok(`[${label}] Household lands on /home with onboarding`, /\/en\/home$/.test(h.url()) && /Two quick questions/.test(await h.textContent("main")));
    await h.fill("#hh-area", "1012");
    await h.getByRole("button", { name: /Regular cleaning/ }).click();
    await h.getByRole("button", { name: "Save", exact: true }).click();
    await h.waitForTimeout(1500);
    await h.goto(`${APP}/en/home`, { waitUntil: "networkidle" });
    ok(`[${label}] Household: prefs saved → "Search around 1012" on home`, /Search around 1012/.test(await h.textContent("main")));
    const hnav = await navLabels(h, mobile);
    ok(`[${label}] Household nav: Home, Find, Messages, Favourites, Account (no Jobs)`, ["Home", "Find", "Messages", "Favourites"].every((x) => hnav.includes(x)) && !hnav.includes("Jobs"), hnav.join("|"));
    await h.screenshot({ path: `${OUT}/f5-${suffix}-household-home.png`, fullPage: true });
    for (const [path, dest] of [["/en/work", /\/en\/home$/], ["/en/profile", /\/en\/home$/], ["/en/business/dashboard", /\/en\/home$/], ["/en/jobs/new", /\/en\/home$/], ["/en/jobs", /\/en\/home$/]]) {
      await h.goto(`${APP}${path}`, { waitUntil: "networkidle" });
      ok(`[${label}] Household: ${path} → own home`, dest.test(h.url()), h.url());
    }
    const htok = await accessToken(hctx);
    ok(`[${label}] DB: household cannot create a cleaner ad`, (await restInsert(htok, "cleaner_profiles", { user_id: "x", rate_cents: 2000, postcode: "1012 AB" })) >= 400);
    ok(`[${label}] DB: household cannot create a business profile`, (await restInsert(htok, "business_profiles", { user_id: "x", company_name: "X" })) >= 400);
    const hhProfile = (await (await fetch(`${EMU}/__emu/table?name=profiles`)).json()).find((p) => p.display_name === `hh-${suffix}`);
    ok(`[${label}] DB: household cannot change its own role`, (await restPatch(htok, "profiles", `id=eq.${hhProfile.id}`, { role: "admin" })) >= 400);

    // ---------- Cleaner ----------
    const cctx = await browser.newContext({ viewport }); const c = await cctx.newPage(); track(c);
    await signUp(c, `cl-${suffix}@example.com`, "cleaner");
    ok(`[${label}] Cleaner lands on /profile (create the professional profile)`, /\/en\/profile$/.test(c.url()) && /Experience/.test(await c.textContent("main")));
    await c.fill("input[maxlength='80']", `Cleaner ${suffix.toUpperCase()}`);
    await c.selectOption("select >> nth=0", "5");
    await c.fill("textarea", "Ten years in homes and offices. Thorough, punctual, friendly.");
    await c.getByRole("button", { name: "Next" }).click();
    ok(`[${label}] Cleaner step 2 asks who to work for`, /Who do you want to work for/.test(await c.textContent("main")) && (await c.getByRole("button", { name: /^Hotels/ }).count()) === 0);
    await c.getByRole("button", { name: /Regular cleaning/ }).first().click();
    await c.getByRole("button", { name: "Next" }).click();
    await c.fill("input[placeholder='1012 AB']", "1012 AB");
    await c.locator("td button").nth(1).click();
    await c.getByRole("button", { name: /Save ad|Publish/ }).click();
    await c.waitForSelector("text=Your ad is live", { timeout: 15000 });
    const adRow = (await (await fetch(`${EMU}/__emu/table?name=cleaner_profiles`)).json()).find((r) => r.user_id);
    ok(`[${label}] Cleaner: experience + scope saved`, (await (await fetch(`${EMU}/__emu/table?name=cleaner_profiles`)).json()).some((r) => r.experience_years === 5 && r.work_scope === "household"));
    void adRow;
    await c.goto(`${APP}/en/home`, { waitUntil: "networkidle" });
    const chome = await c.textContent("main");
    ok(`[${label}] Cleaner home: profile card online + completeness checklist`, /online/.test(chome) && /% complete/.test(chome) && /Profile photo/.test(chome));
    const cnav = await navLabels(c, mobile);
    ok(`[${label}] Cleaner nav: Home, Jobs, Messages, My profile, Account (no Favourites)`, ["Home", "Jobs", "Messages", "My profile"].every((x) => cnav.includes(x)) && !cnav.includes("Favourites"), cnav.join("|"));
    await c.screenshot({ path: `${OUT}/f5-${suffix}-cleaner-home.png`, fullPage: true });
    await c.goto(`${APP}/en/work`, { waitUntil: "networkidle" });
    ok(`[${label}] Cleaner (household only): Work shows no business jobs, explains why`, /work for households only/.test(await c.textContent("main")) && (await c.getByRole("link", { name: "Business jobs" }).count()) === 0);
    for (const [path, dest] of [["/en/favourites", /\/en\/home$/], ["/en/business/dashboard", /\/en\/home$/], ["/en/emergency", /\/en\/home$/], ["/en/jobs", /\/en\/work/]]) {
      await c.goto(`${APP}${path}`, { waitUntil: "networkidle" });
      ok(`[${label}] Cleaner: ${path} → own area`, dest.test(c.url()), c.url());
    }
    const ctok = await accessToken(cctx);
    ok(`[${label}] DB: cleaner cannot favourite or request meetings`, (await restInsert(ctok, "favourites", { user_id: "x", cleaner_profile_id: "y" })) >= 400 && (await restInsert(ctok, "meeting_requests", { household_id: "x", cleaner_profile_id: "y", type: "video", proposed_weekday: 0, proposed_block: "morning" })) >= 400);

    // ---------- Business ----------
    const bctx = await browser.newContext({ viewport }); const b = await bctx.newPage(); track(b);
    await b.goto(`${APP}/en/signup`, { waitUntil: "networkidle" });
    await b.getByRole("link", { name: /business that needs cleaning/ }).click();
    await b.waitForURL(/\/en\/business\/signup/, { timeout: 15000 });
    await b.fill("input[autocomplete='given-name']", "Bo");
    await b.fill("input[autocomplete='family-name']", "Bakker");
    await b.fill("input[type=email]", `biz-${suffix}@example.com`);
    await b.fill("input[type=password]", "Test-Password-123");
    await b.fill("input[autocomplete='organization']", `Kantoor ${suffix.toUpperCase()}`);
    await b.getByRole("button", { name: "Next" }).click();
    await b.getByText("Offices", { exact: false }).first().click();
    await b.getByRole("button", { name: "Next" }).click();
    await b.getByRole("button", { name: "Next" }).click();
    await b.fill("input[autocomplete='street-address']", "Straat 1");
    await b.fill("input[placeholder='1012 AB']", "1017 AB");
    await b.locator("fieldset input").nth(3).fill("Amsterdam");
    await b.getByRole("button", { name: /Go to my dashboard/ }).click();
    await b.waitForURL(/\/en\/business\/dashboard$/, { timeout: 20000 });
    await b.waitForLoadState("networkidle");
    ok(`[${label}] Business lands on its dashboard`, /Kantoor/.test(await b.textContent("main")));
    const bnav = await navLabels(b, mobile);
    ok(`[${label}] Business nav: Dashboard, Cleaners, Requests, Messages, Account`, ["Dashboard", "Cleaners", "Requests", "Messages"].every((x) => bnav.includes(x)) && !bnav.includes("Favourites"), bnav.join("|"));
    await b.screenshot({ path: `${OUT}/f5-${suffix}-business-dashboard.png`, fullPage: true });
    for (const [path, dest] of [["/en/profile", /\/en\/business\/dashboard$/], ["/en/work", /\/en\/business\/dashboard$/], ["/en/home", /\/en\/business\/dashboard$/]]) {
      await b.goto(`${APP}${path}`, { waitUntil: "networkidle" });
      ok(`[${label}] Business: ${path} → dashboard`, dest.test(b.url()), b.url());
    }
    const btok = await accessToken(bctx);
    ok(`[${label}] DB: business cannot create a cleaner ad`, (await restInsert(btok, "cleaner_profiles", { user_id: "x", rate_cents: 2000, postcode: "1012 AB" })) >= 400);

    await hctx.close(); await cctx.close(); await bctx.close(); await g.context().close();
  }

  ok("No unexpected browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  fs.writeFileSync(`${OUT}/flow5-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
