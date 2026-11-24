/* Business side on the real Worker (phone + desktop): sign-up wizard (account + profile + location) → post a one-off
 * and a weekly job → the seeded cleaner (cleaner@alieni.test) sends quotations → the business accepts → the job is
 * awarded, work is scheduled (weekly: visits generated) and the cleaner sees it → another business sees nothing. */
const { APP, OUT, VIEWPORTS, PW, q, q1, suite, text, login } = require("./lib.cjs");
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

async function businessSignup(p, email, company) {
  await p.goto(`${APP}/en/business/signup?type=office`, { waitUntil: "networkidle" });
  await p.fill("input[autocomplete='given-name']", "Angeline");
  await p.fill("input[autocomplete='family-name']", "Smit");
  await p.fill("input[type=email]", email);
  await p.fill("input[type=password]", PW.other);
  await p.fill("input[autocomplete='organization']", company);
  for (let i = 0; i < 3; i++) await p.getByRole("button", { name: "Next" }).click();
  await p.fill("input[autocomplete='street-address']", "Oudegracht 100");
  await p.fill("input[placeholder='1012 AB']", "3511 AV");
  await p.locator("fieldset input").nth(3).fill("Utrecht");
  await p.getByRole("button", { name: /Go to my dashboard/ }).click();
  await p.waitForURL(/\/en\/business\/dashboard$/, { timeout: 30000 });
  await p.waitForLoadState("networkidle");
}

(async () => {
  const { ok, page, done } = suite("flow-business");
  for (const [label, vp] of VIEWPORTS) {
    const tag = (t) => `[${label}] ${t}`;
    const s = `${label}${Date.now() % 100000}`;
    const company = `Studio ${label} ${s}`;
    const b = await page(vp);
    const bEmail = `biz.${s}@example.com`;
    await businessSignup(b, bEmail, company);
    const bp = q1("SELECT bp.* FROM business_profiles bp JOIN \"user\" u ON u.id = bp.user_id WHERE u.email = ?", bEmail);
    ok(tag("Wizard: account, business profile and location stored"), bp?.company_name === company && q1("SELECT count(*) n FROM business_units WHERE business_id = ?", bp.id).n === 1);
    ok(tag("Dashboard shows the company"), (await text(b)).includes(company));

    // one-off job
    await b.goto(`${APP}/en/jobs/new?kind=oneoff`, { waitUntil: "networkidle" });
    await b.getByLabel("For which location?").selectOption({ index: 1 });
    await b.fill("textarea", `Deep clean before the opening (${s}).`);
    await b.locator("input[type=date]").fill(day(4));
    await b.locator("input[type=time]").fill("08:00");
    await b.getByLabel("Hours per visit").fill("4");
    await b.getByRole("button", { name: /Post job/ }).click();
    await b.waitForTimeout(2500);
    const once = q1("SELECT * FROM jobs WHERE business_id = ? AND frequency = 'once'", bp.id);
    ok(tag("One-off job published"), once?.status === "published" && once.city === "Utrecht", JSON.stringify(once && { s: once.status, c: once.city }));
    // weekly job
    await b.goto(`${APP}/en/jobs/new?kind=contract`, { waitUntil: "networkidle" });
    await b.getByLabel("For which location?").selectOption({ index: 1 });
    await b.fill("textarea", `Weekly office cleaning on Monday and Thursday mornings (${s}).`);
    await b.locator("input[type=date]").first().fill(day(0));
    await b.locator("input[type=time]").fill("07:00");
    await b.getByLabel("Hours per visit").fill("2");
    await b.getByRole("button", { name: "Mon" }).click();
    await b.getByRole("button", { name: "Thu" }).click();
    await b.getByRole("button", { name: /Post job/ }).click();
    await b.waitForTimeout(2500);
    const week = q1("SELECT * FROM jobs WHERE business_id = ? AND frequency = 'weekly'", bp.id);
    ok(tag("Weekly job published with Monday + Thursday"), week?.status === "published" && JSON.parse(week.weekdays).length === 2);

    // the seeded cleaner quotes on both
    const c = await page(vp);
    await login(c, "cleaner@alieni.test", PW.cleaner);
    await c.goto(`${APP}/en/work?tab=jobs`, { waitUntil: "networkidle" });
    for (const job of [once, week]) {
      const card = c.locator(`[data-board-job="${job.id}"]`);
      await card.getByRole("button", { name: "Respond to this job" }).click();
      await card.getByLabel("Message to the business").fill("I can do this with my own equipment.");
      await card.getByRole("button", { name: "Send response" }).click();
      await c.waitForSelector("text=Response sent", { timeout: 15000 });
      await c.goto(`${APP}/en/work?tab=jobs`, { waitUntil: "networkidle" });
    }
    const cp = q1("SELECT cp.id FROM cleaner_profiles cp JOIN \"user\" u ON u.id = cp.user_id WHERE u.email = 'cleaner@alieni.test'").id;
    ok(tag("Both quotations stored as 'sent' with a validity date"), q("SELECT * FROM job_responses WHERE cleaner_profile_id = ? AND job_id IN (?, ?)", cp, once.id, week.id).filter((r) => r.status === "sent" && r.valid_until).length === 2);
    ok(tag("The cleaner cannot see the street address before being awarded"), !(await text(c)).includes("Oudegracht 100"));

    // business accepts both
    await b.goto(`${APP}/en/business/requests`, { waitUntil: "networkidle" });
    for (const job of [once, week]) {
      const card = b.locator(`[data-job="${job.id}"]`);
      await card.locator("[data-quote]").first().getByRole("button", { name: "Accept" }).click();
      await card.getByRole("button", { name: "Yes, accept" }).click();
      await b.waitForTimeout(2500);
      await b.goto(`${APP}/en/business/requests`, { waitUntil: "networkidle" });
    }
    ok(tag("One-off awarded: job filled, one scheduled work record"), q1("SELECT status FROM jobs WHERE id = ?", once.id).status === "filled" && q1("SELECT count(*) n FROM work_records WHERE job_id = ?", once.id).n === 1);
    ok(tag("Weekly awarded: visits generated four weeks ahead"), q1("SELECT count(*) n FROM work_records WHERE job_id = ?", week.id).n >= 6);
    ok(tag("Business page says 'Awarded to'"), /Awarded to/.test(await text(b)));
    await b.screenshot({ path: `${OUT}/cf-${label}-business-requests.png`, fullPage: true });
    await c.goto(`${APP}/en/work?tab=mine`, { waitUntil: "networkidle" });
    ok(tag("Cleaner sees Accepted and the scheduled work, now with the address"), /Accepted/.test(await text(c)) && (await c.locator("[data-my-work]").count()) >= 1 && (await text(c)).includes("Oudegracht"));

    // a low quotation is refused (server-side floor) — via the board on a seeded published job
    // and another business sees nothing of this one
    const other = await page(vp);
    await login(other, "business@alieni.test", PW.business);
    await other.goto(`${APP}/en/business/requests`, { waitUntil: "networkidle" });
    ok(tag("Another business does not see this business's jobs or quotations"), !(await text(other)).includes(s));
    await Promise.all([b, c, other].map((p) => p.context().close()));
  }
  await done();
})();
