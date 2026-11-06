/* Part 15 — one-off cleaning, quotations and regular schedules.
 * A business posts a one-off job and a weekly job with a schedule; cleaners send quotations; the business accepts one
 * (the others are declined, work is scheduled, a EUR 0 fee event is recorded); a regular job generates its visits; the
 * cleaner cancels the awarded contract and the future visits disappear. Form validation and role boundaries are checked. */
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
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

async function registerBusiness(browser, viewport, track, { email, company }) {
  const ctx = await browser.newContext({ viewport }); const p = await ctx.newPage(); track(p);
  await p.goto(`${APP}/en/business/signup?type=office`, { waitUntil: "networkidle" });
  await p.fill("input[autocomplete='given-name']", "Angeline");
  await p.fill("input[autocomplete='family-name']", "Chidyamarambe");
  await p.fill("input[type=email]", email);
  await p.fill("input[type=password]", "Test-Password-123");
  await p.fill("input[autocomplete='organization']", company);
  await p.getByRole("button", { name: "Next" }).click();
  await p.getByRole("button", { name: "Next" }).click();
  await p.getByRole("button", { name: "Next" }).click();
  await p.fill("input[autocomplete='street-address']", "3 friswijkerweg");
  await p.fill("input[placeholder='1012 AB']", "7433RB");
  await p.locator("fieldset input").nth(3).fill("Schalkhaar");
  await p.getByRole("button", { name: /Go to my dashboard/ }).click();
  await p.waitForURL(/\/en\/business\/dashboard$/, { timeout: 20000 });
  await p.waitForLoadState("networkidle");
  return { ctx, p, sess: await session(ctx) };
}
async function newCleaner(browser, viewport, track, email) {
  const ctx = await browser.newContext({ viewport }); const p = await ctx.newPage(); track(p);
  await signUp(p, email, "cleaner");
  const sess = await session(ctx);
  const cp = (await rest(sess.access_token, "POST", "cleaner_profiles", { user_id: sess.user.id, status: "published", rate_cents: 2200, min_hours: 2, services: ["regular"], languages: ["nl"], postcode: "7433 RB", radius_km: 15, job_types: ["office"], work_scope: "commercial", work_types: ["commercial_contract"], emergency_opt_in: false, location: "SRID=4326;POINT(6.2200 52.3000)" })).data?.[0];
  return { ctx, p, sess, cp };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const track = (page) => { page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`)); page.on("console", (m) => { if (m.type() === "error" && !/status of (400|404|422)|realtime\/v1\/websocket/.test(m.text())) errors.push(`console: ${m.text()}`); }); };

  for (const [label, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 900 }]]) {
    await fetch(`${EMU}/__emu/reset`);
    const sfx = label === "phone" ? "m" : "d";
    const A = await registerBusiness(browser, viewport, track, { email: `a-${sfx}@example.com`, company: `Kantoor ${sfx.toUpperCase()}` });
    const bpA = (await tbl("business_profiles")).find((b) => b.user_id === A.sess.user.id);
    const C1 = await newCleaner(browser, viewport, track, `c1-${sfx}@example.com`);
    const C2 = await newCleaner(browser, viewport, track, `c2-${sfx}@example.com`);

    // ---------- the form: schedule fields, validation ----------
    await A.p.goto(`${APP}/en/jobs/new?kind=oneoff`, { waitUntil: "networkidle" });
    ok(`[${label}] One-off link preselects "One-off" and asks for date, start time and hours`, (await A.p.getByLabel("Frequency").inputValue()) === "once" && (await A.p.locator("input[type=date]").count()) === 1 && (await A.p.locator("input[type=time]").count()) === 1);
    await A.p.getByLabel("For which location?").selectOption({ index: 1 });
    await A.p.fill("textarea", "Deep clean of the whole office before the opening.");
    await A.p.getByRole("button", { name: /Post job/ }).click();
    ok(`[${label}] A one-off job without a date is refused with a message`, (await A.p.getByText("Pick a date from today onwards.").count()) > 0 && (await tbl("jobs")).length === 0);
    await A.p.locator("input[type=date]").fill(day(3));
    await A.p.locator("input[type=time]").fill("08:00");
    await A.p.getByLabel("Hours per visit").fill("4");
    await A.p.getByRole("button", { name: /Post job/ }).click();
    await A.p.waitForSelector("text=Your job is ready", { timeout: 15000 });
    const jobOnce = (await tbl("jobs")).find((j) => j.frequency === "once");
    ok(`[${label}] One-off job saved with its date, time and hours`, jobOnce?.status === "published" && jobOnce.start_date === day(3) && jobOnce.visit_start?.startsWith("08:00") && Number(jobOnce.visit_hours) === 4);

    await A.p.goto(`${APP}/en/jobs/new?kind=contract`, { waitUntil: "networkidle" });
    ok(`[${label}] Regular link preselects "Weekly" and shows the weekday buttons`, (await A.p.getByLabel("Frequency").inputValue()) === "weekly" && (await A.p.getByRole("button", { name: "Mon" }).count()) === 1);
    await A.p.getByLabel("For which location?").selectOption({ index: 1 });
    await A.p.fill("textarea", "Weekly office cleaning on Monday and Thursday mornings.");
    await A.p.locator("input[type=date]").first().fill(day(0));
    await A.p.locator("input[type=time]").fill("07:00");
    await A.p.getByLabel("Hours per visit").fill("2");
    await A.p.getByRole("button", { name: /Post job/ }).click();
    ok(`[${label}] A weekly job without a weekday is refused with a message`, (await A.p.getByText("Pick at least one day.").count()) > 0);
    await A.p.getByRole("button", { name: "Mon" }).click();
    await A.p.getByRole("button", { name: "Thu" }).click();
    await A.p.getByRole("button", { name: /Post job/ }).click();
    await A.p.waitForSelector("text=Your job is ready", { timeout: 15000 });
    const jobWeek = (await tbl("jobs")).find((j) => j.frequency === "weekly");
    ok(`[${label}] Weekly job saved with weekdays Mon and Thu, 07:00, 2 hours`, jobWeek && JSON.stringify(jobWeek.weekdays) === "[1,4]" && jobWeek.visit_start?.startsWith("07:00") && Number(jobWeek.visit_hours) === 2);

    // ---------- cleaners send quotations ----------
    await C1.p.goto(`${APP}/en/work?tab=jobs`, { waitUntil: "networkidle" });
    ok(`[${label}] Cleaner sees the one-off job with its schedule line`, /One-off/.test(await C1.p.textContent("main")) && /08:00/.test(await C1.p.textContent("main")));
    const board = C1.p.locator(`[data-board-job="${jobOnce.id}"]`);
    await board.getByRole("button", { name: "Respond to this job" }).click();
    await board.getByLabel("Message to the business").fill("Two of us can do this in one morning.");
    await board.getByRole("button", { name: "Send response" }).click();
    await C1.p.waitForSelector("text=Response sent", { timeout: 15000 });
    const q1 = (await tbl("job_responses")).find((r) => r.cleaner_profile_id === C1.cp.id && r.job_id === jobOnce.id);
    ok(`[${label}] Cleaner 1's quotation is saved as "sent" with a validity date`, q1?.status === "sent" && Boolean(q1.valid_until) && q1.job_id === jobOnce.id && q1.rate_cents === 1750);
    const direct = await rest(C1.sess.access_token, "POST", "rpc/submit_job_quote", { p_job_id: jobOnce.id, p_rate_cents: 2000, p_message: "again", p_valid_until: null });
    ok(`[${label}] A second quotation on the same job is refused`, direct.data?.result === "already");
    const low = await rest(C2.sess.access_token, "POST", "rpc/submit_job_quote", { p_job_id: jobOnce.id, p_rate_cents: 900, p_message: "cheap", p_valid_until: null });
    ok(`[${label}] A quotation below the minimum rate is refused`, low.data?.result === "rate");
    const q2 = await rest(C2.sess.access_token, "POST", "rpc/submit_job_quote", { p_job_id: jobOnce.id, p_rate_cents: 2300, p_message: "Cleaner two here", p_valid_until: day(20) });
    ok(`[${label}] Cleaner 2 quotes too`, q2.data?.result === "sent");
    await rest(C1.sess.access_token, "POST", "rpc/submit_job_quote", { p_job_id: jobWeek.id, p_rate_cents: 2100, p_message: "Happy to take the weekly job", p_valid_until: null });
    await rest(C2.sess.access_token, "POST", "rpc/submit_job_quote", { p_job_id: jobWeek.id, p_rate_cents: 2400, p_message: "Also available weekly", p_valid_until: null });

    // ---------- business decides ----------
    await A.p.goto(`${APP}/en/business/requests`, { waitUntil: "networkidle" });
    const onceCard = A.p.locator(`[data-job="${jobOnce.id}"]`);
    ok(`[${label}] Business sees both quotations on the one-off job with the per-visit total`, (await onceCard.locator("[data-quote]").count()) === 2 && /per visit \(4 h\)/.test(await onceCard.textContent()));
    await A.p.screenshot({ path: `${OUT}/f10-${sfx}-business-quotes.png`, fullPage: true });
    // third party cannot decide
    const third = await rest(C1.sess.access_token, "POST", "rpc/accept_job_response", { p_response_id: q1.id });
    ok(`[${label}] A cleaner cannot accept a quotation`, third.data?.result === "not_allowed");
    await onceCard.locator(`[data-quote="${q1.id}"]`).getByRole("button", { name: "Accept" }).click();
    ok(`[${label}] Accepting asks for a second confirmation first`, (await onceCard.getByText("Are you sure? Other quotations will be declined.").count()) === 1 && (await tbl("jobs")).find((j) => j.id === jobOnce.id).status === "published");
    await onceCard.getByRole("button", { name: "Yes, accept" }).click();
    await A.p.waitForSelector(`[data-job="${jobOnce.id}"][data-job-state="awarded"]`, { timeout: 15000 });
    const jobsNow = await tbl("jobs"); const respNow = await tbl("job_responses");
    ok(`[${label}] Accepting awards the job and declines the other quotation`, jobsNow.find((j) => j.id === jobOnce.id).status === "filled" && respNow.find((r) => r.id === q1.id).status === "accepted" && respNow.find((r) => r.cleaner_profile_id === C2.cp.id && r.job_id === jobOnce.id).status === "declined");
    const wr = (await tbl("work_records")).filter((w) => w.job_id === jobOnce.id);
    ok(`[${label}] The one-off work is scheduled for cleaner 1 on the chosen date`, wr.length === 1 && wr[0].service_key === "oneoff" && wr[0].cleaner_profile_id === C1.cp.id && wr[0].scheduled_start?.startsWith(day(3)));
    const fe = (await tbl("fee_events")).filter((e) => e.event_type === "quote_accepted");
    ok(`[${label}] A fee event is recorded at EUR 0 (no pricing rule is active)`, fe.length === 1 && fe[0].amount_cents === 0 && fe[0].service_key === "oneoff");
    ok(`[${label}] The business page shows "Awarded to" the cleaner`, /Awarded to/.test(await A.p.locator(`[data-job="${jobOnce.id}"]`).textContent()));

    // ---------- cleaner side ----------
    await C1.p.goto(`${APP}/en/work?tab=mine`, { waitUntil: "networkidle" });
    ok(`[${label}] Cleaner 1 sees the quotation as Accepted and the scheduled work`, /Accepted/.test(await C1.p.locator("[data-my-quotes]").textContent()) && (await C1.p.locator("[data-my-work]").count()) >= 1);
    await C1.p.screenshot({ path: `${OUT}/f10-${sfx}-cleaner-mine.png`, fullPage: true });
    await C2.p.goto(`${APP}/en/work?tab=mine`, { waitUntil: "networkidle" });
    ok(`[${label}] Cleaner 2 sees their quotation as "Not chosen"`, /Not chosen/.test(await C2.p.locator("[data-my-quotes]").textContent()));
    await C2.p.goto(`${APP}/en/work?tab=jobs`, { waitUntil: "networkidle" });
    ok(`[${label}] The awarded one-off job no longer appears on the board`, !/One-off/.test(await C2.p.textContent("main")) || (await C2.p.locator("main li", { hasText: "08:00" }).count()) === 0);

    // ---------- regular job: accept → visits ----------
    await A.p.goto(`${APP}/en/business/requests`, { waitUntil: "networkidle" });
    const weekCard = A.p.locator(`[data-job="${jobWeek.id}"]`);
    const q3 = (await tbl("job_responses")).find((r) => r.job_id === jobWeek.id && r.cleaner_profile_id === C1.cp.id);
    await weekCard.locator(`[data-quote="${q3.id}"]`).getByRole("button", { name: "Accept" }).click();
    await weekCard.getByRole("button", { name: "Yes, accept" }).click();
    await A.p.waitForSelector(`[data-job="${jobWeek.id}"][data-job-state="awarded"]`, { timeout: 15000 });
    const visits = (await tbl("work_records")).filter((w) => w.job_id === jobWeek.id && w.outcome === "scheduled");
    const wds = [...new Set(visits.map((v) => ((new Date(v.scheduled_start).getUTCDay() + 6) % 7) + 1))].sort().join();
    ok(`[${label}] The weekly job generates visits for the next four weeks, only on Mon and Thu`, visits.length >= 7 && visits.length <= 9 && wds === "1,4", `${visits.length} visits, weekdays ${wds}`);
    ok(`[${label}] A monthly contract event is recorded at EUR 0`, (await tbl("fee_events")).some((e) => e.event_type === "contract_month" && e.amount_cents === 0));
    ok(`[${label}] The business page lists the upcoming visits and a cancel button`, (await A.p.locator(`[data-job="${jobWeek.id}"] li`).count()) >= 1 && (await weekCard.getByRole("button", { name: "Cancel job" }).count()) === 1);
    await A.p.goto(`${APP}/en/business/work`, { waitUntil: "networkidle" });
    ok(`[${label}] Business → Work lists the regular visits`, (await A.p.locator("[data-work]").count()) >= 5);
    await A.p.screenshot({ path: `${OUT}/f10-${sfx}-business-work.png`, fullPage: true });

    // ---------- cleaner cancels the contract ----------
    await C1.p.goto(`${APP}/en/work?tab=mine`, { waitUntil: "networkidle" });
    await C1.p.getByRole("button", { name: "Cancel job" }).first().click();
    await C1.p.getByRole("button", { name: "Yes, cancel" }).click();
    await C1.p.waitForFunction(() => /Ended/.test(document.querySelector("[data-my-quotes]")?.textContent || ""), null, { timeout: 15000 });
    const jw = (await tbl("jobs")).find((j) => j.id === jobWeek.id);
    ok(`[${label}] Cancelling ends the contract (by the cleaner) and removes future visits`, Boolean(jw.ended_at) && jw.ended_by === "cleaner" && (await tbl("work_records")).filter((w) => w.job_id === jobWeek.id && w.outcome === "scheduled").length === 0);
    await A.p.goto(`${APP}/en/business/requests`, { waitUntil: "networkidle" });
    ok(`[${label}] The business sees the job as Ended`, (await A.p.locator(`[data-job="${jobWeek.id}"][data-job-state="ended"]`).count()) === 1);

    // ---------- boundaries ----------
    const hctx = await browser.newContext({ viewport }); const h = await hctx.newPage(); track(h);
    await signUp(h, `hh-${sfx}@example.com`, "household");
    const hs = await session(hctx);
    const hr = await rest(hs.access_token, "POST", "rpc/accept_job_response", { p_response_id: q1.id });
    ok(`[${label}] A household cannot accept quotations`, hr.data?.result === "not_allowed");
    const hq = await rest(hs.access_token, "POST", "rpc/submit_job_quote", { p_job_id: jobWeek.id, p_rate_cents: 2000, p_message: "hi", p_valid_until: null });
    ok(`[${label}] A household cannot send quotations`, hq.data?.result === "no_ad");
    await A.p.goto(`${APP}/en/business/dashboard`, { waitUntil: "networkidle" });
    ok(`[${label}] The dashboard tiles for one-off and regular cleaning are on`, (await A.p.locator("main").textContent()).includes("One-off cleaning") && !/Coming soon/.test(await A.p.locator("main").textContent()));

    for (const x of [A, C1, C2]) await x.ctx.close();
    await hctx.close();
  }

  ok("No unexpected browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  fs.writeFileSync(`${OUT}/flow10-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
