/* Design review helper: opens the main page of every role on a phone and a desktop viewport and saves screenshots to
 * e2e/out/shots/. Needs the app on :3100 and the stand-in on :4000 (see e2e/README.md). */
const { chromium } = require("playwright");
const fs = require("node:fs");
const APP = "http://localhost:3100";
const EMU = "http://localhost:4000";
const OUT = (process.env.E2E_OUT || "e2e/out") + "/shots";
async function signUp(page, email, role) {
  await page.goto(`${APP}/en/signup?role=${role}`, { waitUntil: "networkidle" });
  await page.fill("input[type=email]", email);
  await page.fill("input[autocomplete='given-name']", email.split("@")[0]);
  await page.fill("input[type=password]", "Test-Password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/en\/(home|profile|admin|business\/dashboard)$/, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
}
async function session(ctx) {
  const cookies = await ctx.cookies();
  const raw = cookies.filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.value).join("");
  return JSON.parse(raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64").toString() : decodeURIComponent(raw));
}
async function rest(token, method, path, body) {
  const res = await fetch(`${EMU}/rest/v1/${path}`, { method, headers: { apikey: "emu-anon-key", Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
async function registerBusiness(browser, viewport, email, company) {
  const ctx = await browser.newContext({ viewport }); const p = await ctx.newPage();
  await p.goto(`${APP}/en/business/signup?type=office`, { waitUntil: "networkidle" });
  await p.fill("input[autocomplete='given-name']", "Angeline"); await p.fill("input[autocomplete='family-name']", "de Vries");
  await p.fill("input[type=email]", email); await p.fill("input[type=password]", "Test-Password-123"); await p.fill("input[autocomplete='organization']", company);
  for (let i = 0; i < 3; i++) await p.getByRole("button", { name: "Next" }).click();
  await p.fill("input[autocomplete='street-address']", "3 Friswijkerweg"); await p.fill("input[placeholder='1012 AB']", "7433 RB"); await p.locator("fieldset input").nth(3).fill("Schalkhaar");
  await p.getByRole("button", { name: /Go to my dashboard/ }).click();
  await p.waitForURL(/\/en\/business\/dashboard$/, { timeout: 20000 }); await p.waitForLoadState("networkidle");
  return { ctx, p, sess: await session(ctx) };
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const [label, viewport] of [["m", { width: 390, height: 844 }], ["d", { width: 1280, height: 900 }]]) {
    await fetch(`${EMU}/__emu/reset`);
    const shot = async (page, name, path) => { await page.goto(`${APP}/en${path}`, { waitUntil: "networkidle" }); await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/${label}-${name}.png`, fullPage: true }); };
    const guest = await (await browser.newContext({ viewport })).newPage();
    const biz = await registerBusiness(browser, viewport, `biz-${label}@example.com`, "Kantoor Noord");
    const cctx = await browser.newContext({ viewport }); const c = await cctx.newPage(); await signUp(c, `schoonmaker-${label}@example.com`, "cleaner");
    const cs = await session(cctx);
    const cp = (await rest(cs.access_token, "POST", "cleaner_profiles", { user_id: cs.user.id, status: "published", rate_cents: 2200, min_hours: 2, services: ["regular", "deep"], languages: ["nl", "en"], postcode: "7433 RB", radius_km: 15, job_types: ["household", "office"], work_scope: "both", work_types: ["household_regular", "commercial_contract"], about: "Zorgvuldig en betrouwbaar, 8 jaar ervaring in kantoren en huishoudens.", location: "SRID=4326;POINT(6.2200 52.3000)" })).data?.[0];
    const hctx = await browser.newContext({ viewport }); const h = await hctx.newPage(); await signUp(h, `klant-${label}@example.com`, "household");
    const actx = await browser.newContext({ viewport }); const a = await actx.newPage(); await signUp(a, "afrongelic.events@gmail.com", "household");
    // a job with a quotation so the business pages have content
    const bp = (await (await fetch(`${EMU}/__emu/table?name=business_profiles`)).json())[0];
    const unit = (await (await fetch(`${EMU}/__emu/table?name=business_units`)).json())[0];
    const job = (await rest(biz.sess.access_token, "POST", "jobs", { business_id: bp.id, status: "published", space_type: "office", postcode: "7433 RB", city: "Schalkhaar", unit_id: unit.id, frequency: "weekly", weekdays: [1, 4], visit_start: "07:00", visit_hours: 2, start_date: new Date().toISOString().slice(0, 10), description: "Weekly office cleaning on Monday and Thursday mornings, 280 m2.", budget_cents: 2000, published_at: new Date().toISOString(), expires_at: new Date(Date.now() + 5e9).toISOString() })).data?.[0];
    await rest(cs.access_token, "POST", "rpc/submit_job_quote", { p_job_id: job.id, p_rate_cents: 2100, p_message: "Happy to take this on.", p_valid_until: null });
    for (const [name, page, path] of [
      ["home-guest", guest, ""], ["search", guest, "/search"], ["ad", guest, `/cleaners/${cp.id}`], ["jobs-guest", guest, "/jobs"], ["business-landing", guest, "/business"], ["login", guest, "/login"],
      ["household-home", h, "/home"], ["household-account", h, "/account"], ["household-messages", h, "/messages"],
      ["cleaner-home", c, "/home"], ["cleaner-work", c, "/work?tab=jobs"], ["cleaner-mine", c, "/work?tab=mine"], ["cleaner-profile", c, "/profile"],
      ["business-dashboard", biz.p, "/business/dashboard"], ["business-requests", biz.p, "/business/requests"], ["business-work", biz.p, "/business/work"], ["business-profile", biz.p, "/business/profile"], ["business-newjob", biz.p, "/jobs/new?kind=contract"],
      ["admin-home", a, "/admin"], ["admin-users", a, "/admin/users"], ["admin-services", a, "/admin/services"],
    ]) await shot(page, name, path);
    await browser.contexts().forEach(async () => {});
  }
  await browser.close();
  console.log("done", fs.readdirSync(OUT).length, "screenshots in", OUT);
})();
