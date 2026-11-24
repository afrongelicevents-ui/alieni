/* Cleaner side on the real Worker (phone + desktop): the €15 minimum and banned words are refused by the server,
 * a cleaner can take their own ad offline and back online, an offline ad disappears from search, and a cleaner
 * cannot open admin or business pages. */
const { APP, VIEWPORTS, PW, q1, suite, text, signUp } = require("./lib.cjs");

(async () => {
  const { ok, page, done } = suite("flow-cleaner");
  for (const [label, vp] of VIEWPORTS) {
    const tag = (t) => `[${label}] ${t}`;
    const s = `${label}${Date.now() % 100000}`;
    const c = await page(vp);
    const email = `lotte.${s}@example.com`;
    await signUp(c, email, "cleaner", `Lotte ${label}`);
    const fill = async (about, rate) => {
      // the wizard keeps an unfinished ad in the browser; start each attempt from step 1
      await c.goto(`${APP}/en/cleaners/new`, { waitUntil: "networkidle" });
      await c.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ } });
      await c.reload({ waitUntil: "networkidle" });
      await c.fill("input[maxlength='80']", `Lotte ${label}`);
      await c.fill("input[maxlength='60']", "Groningen");
      await c.fill("textarea", about);
      await c.getByRole("button", { name: "Next" }).click();
      await c.getByRole("button", { name: /Regular cleaning|Regulier/ }).first().click();
      await c.locator("input[inputmode='decimal']").first().fill(rate);
      await c.getByRole("button", { name: "Next" }).click();
    };

    await fill("Careful and friendly.", "12,00");
    ok(tag("Rate below €15 is refused (form)"), /minimum.{0,12}€15/i.test(await text(c)));

    await fill("Geen oplichting hier, beloofd.", "19,50");
    await c.fill("input[placeholder='1012 AB']", "9711 LM");
    await c.locator("td button").nth(0).click();
    await c.getByRole("button", { name: /Save ad|Publish/ }).click();
    await c.waitForTimeout(2500);
    const uid = q1("SELECT id FROM \"user\" WHERE email = ?", email).id;
    ok(tag("Banned word in the ad text is refused by the server"), !q1("SELECT id FROM cleaner_profiles WHERE user_id = ?", uid) && /not allowed/i.test(await text(c)));

    await fill("Careful and friendly, ten years of experience.", "19,50");
    await c.fill("input[placeholder='1012 AB']", "9711 LM");
    await c.locator("td button").nth(0).click();
    await c.getByRole("button", { name: /Save ad|Publish/ }).click();
    await c.waitForSelector("text=Your ad is live", { timeout: 20000 });
    const ad = q1("SELECT * FROM cleaner_profiles WHERE user_id = ?", uid);
    ok(tag("Ad saved with the rate in cents and the postcode area"), ad?.rate_cents === 1950 && ad.postcode_area === "9711" && ad.status === "published");

    await c.getByRole("button", { name: "Take offline" }).click();
    await c.waitForTimeout(1500);
    ok(tag("Cleaner takes their own ad offline"), q1("SELECT status FROM cleaner_profiles WHERE id = ?", ad.id).status === "hidden");
    const g = await page(vp);
    await g.goto(`${APP}/en/search?q=9711LM`, { waitUntil: "networkidle" });
    ok(tag("An offline ad is not in search and its page is closed to others"), !(await text(g)).includes(`Lotte ${label}`) && ((await g.goto(`${APP}/en/cleaners/${ad.id}`)).status() === 404 || !(await text(g, "body")).includes(`Lotte ${label}`)));
    await c.goto(`${APP}/en/cleaners/${ad.id}`, { waitUntil: "networkidle" });
    ok(tag("The owner can still see their offline ad"), (await text(c)).includes(`Lotte ${label}`));
    await c.goto(`${APP}/en/cleaners/new`, { waitUntil: "networkidle" });
    await c.getByRole("button", { name: "Put online" }).click().catch(() => {});
    await c.waitForTimeout(1500);
    ok(tag("…and put it back online"), q1("SELECT status FROM cleaner_profiles WHERE id = ?", ad.id).status === "published");

    for (const path of ["/en/admin", "/en/business/dashboard"]) {
      const r = await c.goto(`${APP}${path}`, { waitUntil: "networkidle" });
      ok(tag(`Cleaner cannot open ${path} (redirect or not found)`), r.status() === 404 || !c.url().includes(path), `${r.status()} ${c.url()}`);
    }
    await c.goto(`${APP}/en/work`, { waitUntil: "networkidle" });
    ok(tag("Work page opens for the cleaner"), /\/en\/work/.test(c.url()));
    await Promise.all([c, g].map((p) => p.context().close()));
  }
  void PW;
  await done();
})();
