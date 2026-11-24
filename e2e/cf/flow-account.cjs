/* Privacy rights on the real Worker (phone + desktop): "Download my data" gives the person's own data only (no
 * password hash, no exact location), and "Delete my account" removes the account, their data and their photo, and
 * signs them out; the old password no longer works. */
const fs = require("node:fs");
const { APP, VIEWPORTS, PW, q1, suite, text, signUp } = require("./lib.cjs");

(async () => {
  const { ok, page, done } = suite("flow-account");
  const published = q1("SELECT id FROM cleaner_profiles WHERE status = 'published' ORDER BY created_at LIMIT 1").id;
  for (const [label, vp] of VIEWPORTS) {
    const tag = (t) => `[${label}] ${t}`;
    const s = `${label}${Date.now() % 100000}`;
    const email = `delete.me.${s}@example.com`;
    const p = await page({ ...vp, acceptDownloads: true });
    await signUp(p, email, "household", `Delete ${label}`);
    await p.goto(`${APP}/en/cleaners/${published}`, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: /Save as favourite/ }).first().click();
    await p.waitForTimeout(1000);
    const uid = q1("SELECT id FROM \"user\" WHERE email = ?", email).id;

    await p.goto(`${APP}/en/account`, { waitUntil: "networkidle" });
    ok(tag("Account page offers download and delete"), (await p.getByRole("link", { name: "Download my data" }).count()) === 1);
    const [download] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "Download my data" }).click()]);
    const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    const blob = JSON.stringify(exported);
    ok(tag("Export: own account, profile and favourite"), exported.account?.email === email && exported.profile?.role === "household" && blob.includes(published));
    ok(tag("Export: no password hash, session token, other people or exact location"), !/pbkdf2|token|"password"|"lat"|"lng"|household@alieni\.test/.test(blob));

    await p.getByRole("button", { name: "Delete my account" }).click();
    const confirm = p.getByRole("button", { name: "Yes, delete my account" });
    ok(tag("Delete stays disabled until the e-mail address is typed"), await confirm.isDisabled());
    await p.fill("#delete-email", email);
    await confirm.click();
    await p.waitForTimeout(3000);
    ok(tag("Account, profile and favourites are gone from D1"), !q1("SELECT id FROM \"user\" WHERE id = ?", uid) && !q1("SELECT id FROM profiles WHERE id = ?", uid) && !q1("SELECT user_id FROM favourites WHERE user_id = ?", uid));
    ok(tag("Signed out afterwards"), (await (await p.request.get(`${APP}/api/me`)).json()).role === "guest");
    await p.goto(`${APP}/en/login`, { waitUntil: "networkidle" });
    await p.fill("input[type=email]", email);
    await p.fill("input[type=password]", PW.other);
    await p.getByRole("button", { name: "Log in", exact: true }).click();
    await p.waitForTimeout(2500);
    ok(tag("The old password no longer works"), /\/en\/login/.test(p.url()) && (await (await p.request.get(`${APP}/api/me`)).json()).role === "guest");
    void text;
    await p.context().close();
  }
  await done();
})();
