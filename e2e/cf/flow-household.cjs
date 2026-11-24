/* Marketplace end to end on the real Worker (phone 390 px and desktop):
 * cleaner publishes an ad with a photo (EXIF must be gone in R2) → household finds it, saves it as favourite,
 * requests a meeting (contacts masked in D1) → cleaner accepts and replies (masked) → both confirm a deal →
 * contacts unmasked → household writes a review and reports the ad → a third person cannot open the chat. */
const fs = require("node:fs");
const { APP, OUT, VIEWPORTS, PW, q, q1, suite, text, signUp, PHOTO_WITH_EXIF } = require("./lib.cjs");

(async () => {
  const { ok, page, done } = suite("flow-household");
  for (const [label, vp] of VIEWPORTS) {
    const s = `${label}-${Date.now() % 100000}`;
    const tag = (t) => `[${label}] ${t}`;

    // ---------- Cleaner: sign up, publish an ad, add a photo ----------
    const c = await page(vp);
    const cEmail = `sandra.${s}@example.com`;
    await signUp(c, cEmail, "cleaner", `Sandra ${label}`);
    await c.goto(`${APP}/en/cleaners/new`, { waitUntil: "networkidle" });
    await c.fill("input[maxlength='80']", `Sandra ${label}`);
    await c.fill("input[maxlength='60']", "Amsterdam");
    await c.fill("textarea", "Ten years of experience, thorough and friendly.");
    await c.getByRole("button", { name: "Next" }).click();
    await c.getByRole("button", { name: /Regular cleaning|Regulier/ }).first().click();
    await c.getByRole("button", { name: "Next" }).click();
    await c.fill("input[placeholder='1012 AB']", "1012 AB");
    await c.locator("td button").nth(0).click();
    await c.locator("td button").nth(10).click();
    await c.getByRole("button", { name: /Save ad|Publish/ }).click();
    await c.waitForSelector("text=Your ad is live", { timeout: 20000 });
    const ad = q1("SELECT cp.* FROM cleaner_profiles cp JOIN \"user\" u ON u.id = cp.user_id WHERE u.email = ?", cEmail);
    ok(tag("Cleaner: ad stored in D1 as published, with availability"), ad?.status === "published" && q1("SELECT count(*) n FROM availability_slots WHERE cleaner_profile_id = ?", ad.id).n === 2);
    await c.locator("form input[type=file]").first().setInputFiles(PHOTO_WITH_EXIF);
    await c.getByRole("button", { name: "Save photo" }).click();
    await c.waitForSelector("text=Photo saved", { timeout: 20000 });
    const key = q1("SELECT photo_key FROM cleaner_profiles WHERE id = ?", ad.id)?.photo_key;
    const r2dir = ".wrangler/state/v3/r2/alieni-files/blobs";
    const blobs = fs.existsSync(r2dir) ? fs.readdirSync(r2dir).map((f) => fs.readFileSync(`${r2dir}/${f}`)) : [];
    ok(tag("Photo: stored in private R2 as WebP, without the camera/GPS EXIF"), /^profile\/.+\.webp$/.test(key || "") && blobs.length > 0 && blobs.every((b) => !b.includes("SecretCamera")), key);
    await c.screenshot({ path: `${OUT}/cf-${label}-ad-live.png`, fullPage: true });

    // ---------- Household: search, open the ad, favourite, request a meeting ----------
    const h = await page(vp);
    const hEmail = `jansen.${s}@example.com`;
    await signUp(h, hEmail, "household", `Jansen ${label}`);
    await h.goto(`${APP}/en/search?q=1012AB`, { waitUntil: "networkidle" });
    ok(tag("Search: the new cleaner is listed, photo via a signed /api/files link"), (await text(h)).includes(`Sandra ${label}`) && (await h.locator("img[src*='/api/files/profile/']").count()) > 0);
    const img = await h.locator("img[src*='/api/files/profile/']").first().getAttribute("src");
    const photoRes = await h.request.get(`${APP}${img}`);
    ok(tag("Photo link works, and fails without its signature"), photoRes.status() === 200 && (await h.request.get(`${APP}${img.split("?")[0]}`)).status() === 404);
    await h.goto(`${APP}/en/cleaners/${ad.id}`, { waitUntil: "networkidle" });
    ok(tag("Ad page shows the postcode area, never the full postcode"), (await text(h)).includes("1012") && !(await text(h)).includes("1012 AB"));
    await h.getByRole("button", { name: /Save as favourite/ }).first().click();
    await h.waitForTimeout(1000);
    const hid = q1("SELECT id FROM \"user\" WHERE email = ?", hEmail).id;
    ok(tag("Favourite saved in D1"), q1("SELECT count(*) n FROM favourites WHERE user_id = ? AND cleaner_profile_id = ?", hid, ad.id).n === 1);
    await h.getByRole("button", { name: /Request a meeting|Kennismaking/ }).click();
    await h.locator("label", { hasText: /Monday/ }).first().click();
    await h.fill("textarea", "Hi Sandra, call me on 06 12345678 or mail jansen@example.com");
    await h.getByRole("button", { name: /Send request/ }).click();
    await h.waitForURL(/\/en\/messages\/[0-9a-f-]{36}$/, { timeout: 20000 });
    await h.waitForLoadState("networkidle");
    const threadUrl = h.url();
    const convId = threadUrl.split("/").pop();
    const first = q1("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at LIMIT 1", convId);
    ok(tag("Meeting request + conversation + first message in D1"), Boolean(first) && q1("SELECT count(*) n FROM meeting_requests WHERE household_id = ?", hid).n === 1);
    ok(tag("Masking: phone number and e-mail hidden in the STORED message"), first && !first.body.includes("12345678") && !first.body.includes("jansen@") && first.masked === 1, first?.body);

    // ---------- Cleaner: accepts, replies (masked), polling shows it to the household ----------
    await c.goto(`${APP}/en/messages`, { waitUntil: "networkidle" });
    ok(tag("Cleaner: conversation listed"), (await text(c)).includes(`Jansen ${label}`));
    await c.goto(threadUrl, { waitUntil: "networkidle" });
    await c.getByRole("button", { name: "Accept" }).click();
    await c.waitForTimeout(1500);
    ok(tag("Cleaner: meeting accepted"), q1("SELECT status FROM meeting_requests WHERE household_id = ?", hid).status === "accepted");
    await c.fill("#chat-draft", "Great, Monday 9:30 works. My number is 0687654321");
    await c.keyboard.press("Enter");
    await h.waitForFunction(() => document.querySelector("main")?.textContent?.includes("Monday 9:30"), null, { timeout: 15000 }).catch(() => {});
    ok(tag("Chat polling: the household sees the reply without reloading"), (await text(h)).includes("Monday 9:30"));
    ok(tag("Cleaner's number masked in D1 and on screen"), !q1("SELECT body FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1", convId).body.includes("0687654321") && !(await text(h)).includes("0687654321"));

    // ---------- Deal ----------
    await h.getByRole("button", { name: /We have a deal/ }).click();
    await h.waitForTimeout(1500);
    await c.goto(threadUrl, { waitUntil: "networkidle" });
    await c.getByRole("button", { name: /We have a deal/ }).click();
    await c.waitForTimeout(1500);
    const conn = q1("SELECT * FROM connections WHERE household_id = ?", hid);
    ok(tag("Deal: connection active after both confirmed"), conn?.status === "active" && Boolean(conn.started_at));
    await c.goto(threadUrl, { waitUntil: "networkidle" });
    await c.fill("#chat-draft", "Now you can reach me on 0687654321");
    await c.keyboard.press("Enter");
    await c.waitForTimeout(2500);
    const last = q1("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1", convId);
    ok(tag("After the deal: contact details stored unmasked"), last.body.includes("0687654321") && last.masked === 0);
    await h.goto(threadUrl, { waitUntil: "networkidle" });
    ok(tag("Household sees the phone number now"), (await text(h)).includes("0687654321"));
    await h.screenshot({ path: `${OUT}/cf-${label}-connected.png`, fullPage: true });

    // ---------- Review and report ----------
    await h.goto(`${APP}/en/cleaners/${ad.id}`, { waitUntil: "networkidle" });
    const reviewBtn = h.getByRole("button", { name: /Write a review|review/i }).first();
    if (await reviewBtn.count()) {
      await reviewBtn.click();
      await h.locator("input[type=radio][value='5'], button[aria-label*='5']").first().click().catch(() => {});
      await h.locator("form textarea").last().fill("Very thorough and friendly.");
      await h.getByRole("button", { name: /Post review|Send review|Submit/i }).first().click();
      await h.waitForTimeout(1500);
    }
    ok(tag("Review stored for the connection"), q1("SELECT count(*) n FROM reviews WHERE connection_id = ?", conn.id).n === 1);
    await h.getByRole("button", { name: /Report/ }).first().click();
    await h.locator("input[value=fake]").check();
    await h.fill("form textarea >> nth=-1", "Test report from the e2e flow.");
    await h.getByRole("button", { name: /Send report|Submit/ }).click();
    await h.waitForTimeout(1500);
    ok(tag("Report stored, linked to the ad"), q1("SELECT count(*) n FROM reports WHERE reporter_id = ? AND subject_id = ?", hid, ad.id).n === 1);

    // ---------- A stranger cannot open the conversation ----------
    const x = await page(vp);
    await signUp(x, `stranger.${s}@example.com`, "household");
    await x.goto(threadUrl, { waitUntil: "networkidle" });
    ok(tag("A third person cannot open the conversation"), !(await text(x)).includes("Monday 9:30") && !(await text(x)).includes("0687654321"));
    await Promise.all([c, h, x].map((p) => p.context().close()));
  }
  void PW;
  await done();
})();
