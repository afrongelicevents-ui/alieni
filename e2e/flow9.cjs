/* Part 14 — private company information.
 * Business registration with an address typed like a real user (postcode without a space), dashboard, posting a
 * job, the jobs board for a guest / a cleaner / the owner / another business, and privacy between businesses:
 * only the company name and type are public; contact, VAT, units and billing stay with the owner and admins. */
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
const tbl = async (name) => (await fetch(`${EMU}/__emu/table?name=${name}`)).json();
const inMs = (ms) => new Date(Date.now() + ms).toISOString();

async function registerBusiness(browser, viewport, track, { email, company, street, postcode, city, type }) {
  const ctx = await browser.newContext({ viewport }); const p = await ctx.newPage(); track(p);
  await p.goto(`${APP}/en/business/signup?type=${type}`, { waitUntil: "networkidle" });
  await p.fill("input[autocomplete='given-name']", "Angeline");
  await p.fill("input[autocomplete='family-name']", "Chidyamarambe");
  await p.fill("input[type=email]", email);
  await p.fill("input[type=password]", "Test-Password-123");
  await p.fill("input[autocomplete='organization']", company);
  await p.getByRole("button", { name: "Next" }).click();
  await p.getByRole("button", { name: "Next" }).click();
  await p.getByRole("button", { name: "Next" }).click();
  await p.fill("input[autocomplete='street-address']", street);
  await p.fill("input[placeholder='1012 AB']", postcode);
  await p.locator("fieldset input").nth(3).fill(city);
  await p.getByRole("button", { name: /Go to my dashboard/ }).click();
  await p.waitForURL(/\/en\/business\/dashboard$/, { timeout: 20000 });
  await p.waitForLoadState("networkidle");
  return { ctx, p, sess: await session(ctx) };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const track = (page) => { page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`)); page.on("console", (m) => { if (m.type() === "error" && !/status of (400|404|422)|realtime\/v1\/websocket/.test(m.text())) errors.push(`console: ${m.text()}`); }); };

  for (const [label, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 900 }]]) {
    await fetch(`${EMU}/__emu/reset`);
    const sfx = label === "phone" ? "m" : "d";

    // ---------- Business A: registration + address (postcode typed without a space) + dashboard ----------
    const A = await registerBusiness(browser, viewport, track, { email: `a-${sfx}@example.com`, company: `Kantoor A ${sfx.toUpperCase()}`, street: "3 friswijkerweg", postcode: "7433RB", city: "Schalkhaar", type: "office" });
    const bpA = (await tbl("business_profiles")).find((b) => b.user_id === A.sess.user.id);
    const unitA = (await tbl("business_units")).find((u) => u.business_id === bpA?.id);
    ok(`[${label}] Business A registers: company saved, no error`, Boolean(bpA) && bpA.company_name === `Kantoor A ${sfx.toUpperCase()}` && bpA.kvk_number == null);
    ok(`[${label}] Business A address saved and normalised ("7433RB" → "7433 RB")`, unitA?.postcode === "7433 RB" && unitA.city === "Schalkhaar" && unitA.address_line === "3 friswijkerweg");
    ok(`[${label}] Business A dashboard opens with the company name`, new RegExp(`Kantoor A ${sfx.toUpperCase()}`).test(await A.p.textContent("main")) && (await A.p.locator("[data-error-detail]").count()) === 0);
    await A.p.goto(`${APP}/en/business/profile`, { waitUntil: "networkidle" });
    ok(`[${label}] Business A owner sees the full profile (contact name, address)`, /Angeline/.test(await A.p.textContent("main")) && /friswijkerweg/.test(await A.p.textContent("main")));

    // ---------- Business A posts a job ----------
    await A.p.goto(`${APP}/en/jobs/new`, { waitUntil: "networkidle" });
    await A.p.selectOption("select >> nth=0", "office");
    await A.p.selectOption("select >> nth=1", { index: 1 });
    await A.p.getByLabel("Frequency").selectOption("once");
    await A.p.locator("input[type=date]").fill(new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10));
    await A.p.fill("textarea", "Weekly office cleaning, evenings, 300 m2, supplies provided.");
    await A.p.getByRole("button", { name: /Post job/ }).click();
    await A.p.waitForSelector("text=Your job is ready", { timeout: 15000 });
    ok(`[${label}] Business A job published`, (await tbl("jobs")).some((j) => j.business_id === bpA.id && j.status === "published"));
    await A.p.goto(`${APP}/en/jobs`, { waitUntil: "networkidle" });
    ok(`[${label}] Owner sees own job marked "Your job" (matched on company id, not user id)`, /Your job/.test(await A.p.textContent("main")) && new RegExp(`Kantoor A ${sfx.toUpperCase()}`).test(await A.p.textContent("main")));
    await A.p.screenshot({ path: `${OUT}/f9-${sfx}-owner-jobs.png`, fullPage: true });

    // ---------- Business B: registers, sees A's job by name only, dashboard shows only B ----------
    const B = await registerBusiness(browser, viewport, track, { email: `b-${sfx}@example.com`, company: `Hotel B ${sfx.toUpperCase()}`, street: "Kade 5", postcode: "1011 AB", city: "Amsterdam", type: "hotel" });
    await B.p.goto(`${APP}/en/jobs`, { waitUntil: "networkidle" });
    const bJobs = await B.p.textContent("main");
    ok(`[${label}] Business B sees A's job with A's company name, not marked as its own`, new RegExp(`Kantoor A ${sfx.toUpperCase()}`).test(bJobs) && !/Your job/.test(bJobs));
    await B.p.goto(`${APP}/en/business/dashboard`, { waitUntil: "networkidle" });
    ok(`[${label}] Business B dashboard shows only B`, new RegExp(`Hotel B ${sfx.toUpperCase()}`).test(await B.p.textContent("main")) && !new RegExp(`Kantoor A`).test(await B.p.textContent("main")));
    await B.p.screenshot({ path: `${OUT}/f9-${sfx}-business-b-dashboard.png`, fullPage: true });

    // privacy through the data interface (each user's own token)
    const bpAll = await rest(B.sess.access_token, "GET", "business_profiles?select=company_name,btw_number,contact_first_name,contact_last_name,unit_count,payment_failed_at");
    ok(`[${label}] Business B can read only its own business_profiles row (A's contact, VAT, units, billing are not readable)`, bpAll.data?.length === 1 && bpAll.data[0].company_name === `Hotel B ${sfx.toUpperCase()}`, JSON.stringify(bpAll.data?.map((r) => r.company_name)));
    // units privacy between businesses is enforced by the database rules and verified on a real Postgres (npm run test:rls)

    // ---------- household and guest ----------
    const hctx = await browser.newContext({ viewport }); const h = await hctx.newPage(); track(h);
    await signUp(h, `hh-${sfx}@example.com`, "household");
    const hs = await session(hctx);
    const hp = await rest(hs.access_token, "GET", "business_profiles?select=company_name,btw_number,contact_first_name");
    ok(`[${label}] Household reads no business_profiles rows`, Array.isArray(hp.data) && hp.data.length === 0);
    const pub = await rest(hs.access_token, "GET", "business_public?select=*");
    ok(`[${label}] Household reads the public view: only A (has a job), only id + company_name + business_type`, pub.data?.length === 1 && pub.data[0].company_name === `Kantoor A ${sfx.toUpperCase()}` && Object.keys(pub.data[0]).sort().join() === "business_type,company_name,id", JSON.stringify(pub.data));
    const anon = await rest("emu-anon-key", "GET", "business_public?select=id,company_name");
    ok(`[${label}] Guest (public key only) reads the company name of A, not B`, anon.data?.length === 1 && /Kantoor A/.test(anon.data[0].company_name), JSON.stringify(anon.data));
    const g = await (await browser.newContext({ viewport })).newPage(); track(g);
    await g.goto(`${APP}/en/jobs`, { waitUntil: "networkidle" });
    ok(`[${label}] Guest jobs board shows the job with the company name`, new RegExp(`Kantoor A ${sfx.toUpperCase()}`).test(await g.textContent("main")));
    await g.screenshot({ path: `${OUT}/f9-${sfx}-guest-jobs.png`, fullPage: true });

    // ---------- cleaner: Work → Business jobs and My jobs show the company name ----------
    const cctx = await browser.newContext({ viewport }); const c = await cctx.newPage(); track(c);
    await signUp(c, `cl-${sfx}@example.com`, "cleaner");
    const cs = await session(cctx);
    const cpRow = (await rest(cs.access_token, "POST", "cleaner_profiles", { user_id: cs.user.id, status: "published", rate_cents: 2200, min_hours: 2, services: ["regular"], languages: ["nl"], postcode: "7433 RB", radius_km: 15, job_types: ["office"], work_scope: "commercial", work_types: ["commercial_contract"], location: "SRID=4326;POINT(6.2200 52.3000)" })).data?.[0];
    await c.goto(`${APP}/en/work?tab=jobs`, { waitUntil: "networkidle" });
    ok(`[${label}] Cleaner sees A's job in Work → Business jobs with the company name`, new RegExp(`Kantoor A ${sfx.toUpperCase()}`).test(await c.textContent("main")));
    ok(`[${label}] Cleaner reads no business_profiles rows either`, (await rest(cs.access_token, "GET", "business_profiles?select=company_name")).data?.length === 0);
    // the cleaner quotes on A's job and A accepts → My jobs shows the company via the view
    const aJob = (await tbl("jobs")).find((j) => j.status === "published");
    const quote = await rest(cs.access_token, "POST", "rpc/submit_job_quote", { p_job_id: aJob.id, p_rate_cents: 2600, p_message: "Available." });
    const respId = (await tbl("job_responses")).find((r) => r.job_id === aJob.id)?.id;
    const acc = await rest(A.sess.access_token, "POST", "rpc/accept_job_response", { p_response_id: respId });
    await c.goto(`${APP}/en/work?tab=mine`, { waitUntil: "networkidle" });
    ok(`[${label}] A accepts the cleaner's quotation; My jobs shows A's company name`, quote.data?.result === "sent" && acc.data?.result === "accepted" && new RegExp(`Kantoor A ${sfx.toUpperCase()}`).test(await c.textContent("[data-my-work]")), JSON.stringify([quote.data, acc.data]));
    await c.screenshot({ path: `${OUT}/f9-${sfx}-cleaner-myjobs.png`, fullPage: true });

    // ---------- admin still reads the full business list ----------
    const adctx = await browser.newContext({ viewport }); const ad = await adctx.newPage(); track(ad);
    await signUp(ad, "afrongelic.events@gmail.com", "household");
    await ad.goto(`${APP}/en/admin/business`, { waitUntil: "networkidle" });
    ok(`[${label}] Admin → Business lists both companies`, new RegExp(`Kantoor A ${sfx.toUpperCase()}`).test(await ad.textContent("main")) && new RegExp(`Hotel B ${sfx.toUpperCase()}`).test(await ad.textContent("main")));

    for (const x of [A, B]) await x.ctx.close();
    await hctx.close(); await cctx.close(); await adctx.close(); await g.context().close();
  }

  ok("No unexpected browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  fs.writeFileSync(`${OUT}/flow9-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
