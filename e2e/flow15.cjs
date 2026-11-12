/* Business pricing model (Admin → Settings → Business pricing): the admin picks ONE model and the website text
 * and sign-up screens follow it — a) fixed monthly fee per location, b) fee per job post, c) monthly tiers, d) free.
 * Payments stay off; this only controls what is shown and calculated. App on :3100 (or APP). */
const { chromium } = require("playwright");
const fs = require("node:fs");
const APP = process.env.APP || "http://localhost:3100";
const EMU = "http://localhost:4000";
const OUT = process.env.E2E_OUT || "e2e/out";
const results = [];
function ok(name, pass, detail = "") { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); }
const tbl = async (name) => (await fetch(`${EMU}/__emu/table?name=${name}`)).json();
const text = async (p) => ((await p.textContent("main")) || "").replace(/\s+/g, " ");

async function signUp(page, email, role) {
  await page.goto(`${APP}/en/signup?role=${role}`, { waitUntil: "networkidle" });
  await page.fill("input[type=email]", email);
  const n = page.locator("input[autocomplete='given-name']"); if (await n.count()) await n.fill(email.split("@")[0]);
  await page.fill("input[type=password]", "Test-Password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/en\/(home|profile|admin|business\/dashboard)$/, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
}

/** Pick a model on the settings page, fill its amounts, save. */
async function choose(admin, model, fill) {
  await admin.goto(`${APP}/en/admin/settings`, { waitUntil: "networkidle" });
  await admin.locator(`input[name='business-pricing-model'][value='${model}']`).check();
  if (fill) await fill(admin);
  await admin.getByRole("button", { name: "Save" }).click();
  await admin.waitForSelector("text=Saved", { timeout: 15000 });
}

/** Business sign-up up to the live total (no account is created before "Finish"). */
async function liveTotal(page, type, units) {
  await page.goto(`${APP}/en/business/signup?type=${type}`, { waitUntil: "networkidle" });
  await page.fill("input[autocomplete='given-name']", "Price");
  await page.fill("input[autocomplete='family-name']", "Check");
  await page.fill("input[type=email]", "price.check@example.com");
  await page.fill("input[type=password]", "Test-Password-123");
  await page.locator("input").nth(4).fill("Price Check BV");
  await page.getByRole("button", { name: "Next" }).click();
  const step1 = await text(page);
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator("input[type=number]").fill(String(units));
  return { cards: step1, total: await text(page) };
}

(async () => {
  await fetch(`${EMU}/__emu/reset`);
  const browser = await chromium.launch();
  const errors = [];
  const track = (p) => { p.on("pageerror", (e) => errors.push("pageerror: " + e.message)); p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); }); };

  const actx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await actx.newPage(); track(admin);
  await signUp(admin, "afrongelic.events@gmail.com", "household"); // allow-listed: becomes admin

  const vctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const v = await vctx.newPage(); track(v);

  // ---- default (a, no amount set): nothing changes for visitors ----
  await v.goto(`${APP}/en/business`, { waitUntil: "networkidle" });
  ok("a) default model: business overview shows 'Price to be announced'", /Price to be announced/.test(await text(v)));

  // ---- b) fee per job post ----
  await choose(admin, "per_job_post", async (p) => p.locator("[data-business-pricing] input[type=text]").first().fill("9,95"));
  const sb = (await tbl("settings")).find((s) => s.key === "business_pricing")?.value;
  ok("b) saved to settings.business_pricing", sb?.model === "per_job_post" && sb?.job_post_cents === 995, JSON.stringify(sb));
  await v.goto(`${APP}/en/business`, { waitUntil: "networkidle" });
  ok("b) business overview: €9.95 per job post on the type cards", (await text(v)).match(/€9\.95 per job post/g)?.length >= 4, (await text(v)).slice(0, 0));
  await v.goto(`${APP}/en/business/office`, { waitUntil: "networkidle" });
  ok("b) type page: per job post, no monthly fee", /€9\.95 per job post/.test(await text(v)) && /No monthly fee/.test(await text(v)));
  let s = await liveTotal(v, "office", 3);
  ok("b) sign-up: live total says per job post", /€9\.95 per job post/.test(s.total) && !/× €/.test(s.total));
  await v.goto(`${APP}/en`, { waitUntil: "networkidle" });
  ok("b) homepage business block: 'Pay per job you post'", /Pay per job you post/.test(await text(v)));
  await v.goto(`${APP}/en/about`, { waitUntil: "networkidle" });
  ok("b) About page: businesses pay for each job they post", /businesses pay a fee for each job they post/.test(await text(v)));

  // ---- c) tiers ----
  await choose(admin, "tiers", async (p) => {
    for (let i = 0; i < 2; i++) await p.getByRole("button", { name: "Add tier" }).click();
    const rows = p.locator("[data-tier-row]");
    await rows.nth(0).locator("input").nth(0).fill("Basic"); await rows.nth(0).locator("input").nth(1).fill("3"); await rows.nth(0).locator("input").nth(2).fill("49");
    await rows.nth(1).locator("input").nth(0).fill("Plus"); await rows.nth(1).locator("input").nth(1).fill("10"); await rows.nth(1).locator("input").nth(2).fill("99,00");
  });
  const sc = (await tbl("settings")).find((x) => x.key === "business_pricing")?.value;
  ok("c) tiers saved (names, limits, prices in cents)", sc?.model === "tiers" && sc?.tiers?.length === 2 && sc.tiers[1].price_cents === 9900, JSON.stringify(sc?.tiers));
  await v.goto(`${APP}/en/business`, { waitUntil: "networkidle" });
  ok("c) business overview: 'From €49.00 / month'", /From €49\.00 \/ month/.test(await text(v)));
  await v.goto(`${APP}/en/business/hotel`, { waitUntil: "networkidle" });
  ok("c) type page lists both plans", /Basic: €49\.00 \/ month/.test(await text(v)) && /Plus: €99\.00 \/ month/.test(await text(v)));
  s = await liveTotal(v, "office", 4);
  ok("c) sign-up with 4 locations: the Plus plan", /Plus: €99\.00 \/ month/.test(s.total), s.total.match(/Your price.{0,80}/)?.[0]);
  s = await liveTotal(v, "office", 12);
  ok("c) sign-up with 12 locations: price on request", /More than 10 locations\? Price on request/.test(s.total));

  // ---- d) free ----
  await choose(admin, "free");
  await v.goto(`${APP}/en/business`, { waitUntil: "networkidle" });
  ok("d) business overview: Free for businesses", (await text(v)).match(/Free for businesses/g)?.length >= 4);
  s = await liveTotal(v, "restaurant", 2);
  ok("d) sign-up: Free for businesses", /Free for businesses/.test(s.total));
  await v.goto(`${APP}/en`, { waitUntil: "networkidle" });
  ok("d) homepage business block: Free for businesses", /Free for businesses — no commission/.test(await text(v)));

  // ---- invalid input is refused, the previous choice stays ----
  await admin.goto(`${APP}/en/admin/settings`, { waitUntil: "networkidle" });
  await admin.locator("input[name='business-pricing-model'][value='per_job_post']").check();
  await admin.locator("[data-business-pricing] input[type=text]").first().fill("");
  await admin.getByRole("button", { name: "Save" }).click();
  await admin.waitForTimeout(1500);
  ok("per job post without an amount is refused; 'free' stays saved", /Check the business pricing/.test(await admin.textContent("form")) && (await tbl("settings")).find((x) => x.key === "business_pricing")?.value?.model === "free");

  // ---- a) back to per location ----
  await choose(admin, "per_location");
  await v.goto(`${APP}/en/business`, { waitUntil: "networkidle" });
  ok("a) back to per location: overview shows the per-type state again", /Price to be announced/.test(await text(v)) && !/Free for businesses/.test(await text(v)));

  ok("No unexpected browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/flow15-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
