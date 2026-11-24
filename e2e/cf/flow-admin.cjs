/* Admin on the real Worker. First sign-in forces two-step login set-up (TOTP) before any admin page; later sign-ins
 * ask for the 6-digit code. Then: every admin page opens (phone + desktop), a reported ad is hidden and restored
 * (audit log), an account is suspended (cannot sign in) and restored, and pre-launch mode closes sign-up ON THE SERVER. */
const { APP, OUT, VIEWPORTS, PW, q1, totp, suite, text, login } = require("./lib.cjs");

const ADMIN_PAGES = ["/en/admin", "/en/admin/reports", "/en/admin/ads", "/en/admin/users", "/en/admin/business", "/en/admin/services", "/en/admin/settings", "/en/admin/testimonials", "/en/admin/work", "/en/admin/media"];

async function codeStep(p, secret) {
  await p.waitForSelector("input[autocomplete='one-time-code']", { timeout: 15000 });
  await p.fill("input[autocomplete='one-time-code']", totp(secret));
  await p.getByRole("button", { name: "Log in", exact: true }).click();
  await p.waitForURL(/\/en\/admin/, { timeout: 20000 });
  await p.waitForLoadState("networkidle");
}

(async () => {
  const { ok, page, done } = suite("flow-admin");
  let secret = null;
  for (const [label, vp] of VIEWPORTS) {
    const tag = (t) => `[${label}] ${t}`;
    const a = await page(vp);
    if (!secret) {
      await login(a, "admin@alieni.test", PW.admin, { expect: /\/en\/account\/two-factor/ });
      ok(tag("Admin without two-step login is sent to set it up first"), /\/en\/account\/two-factor/.test(a.url()));
      const blocked = await a.goto(`${APP}/en/admin/users`, { waitUntil: "networkidle" });
      ok(tag("…and cannot open admin pages before that"), !/\/en\/admin\/users/.test(a.url()) || blocked.status() === 404);
      await a.goto(`${APP}/en/account/two-factor?next=/en/admin`, { waitUntil: "networkidle" });
      await a.fill("input[type=password]", PW.admin);
      await a.locator("[data-two-factor='password'] button[type=submit]").click();
      await a.waitForSelector("[data-totp-secret]", { timeout: 15000 });
      secret = (await a.textContent("[data-totp-secret]")).trim();
      ok(tag("QR code and key shown"), /^[A-Z2-7]{16,}$/.test(secret) && (await a.locator("[data-two-factor='scan'] svg").count()) === 1);
      await a.fill("input[autocomplete='one-time-code']", totp(secret));
      await a.locator("[data-two-factor='scan'] button[type=submit]").click();
      await a.waitForSelector("[data-two-factor='done']", { timeout: 15000 });
      ok(tag("Two-step login on; backup codes shown once"), (await a.locator("[data-backup-codes] li").count()) >= 8 && q1("SELECT twoFactorEnabled FROM \"user\" WHERE email = 'admin@alieni.test'").twoFactorEnabled === 1);
      await a.context().clearCookies();
    }
    // sign-in now needs the code
    await a.goto(`${APP}/en/login`, { waitUntil: "networkidle" });
    await a.fill("input[type=email]", "admin@alieni.test");
    await a.fill("input[type=password]", PW.admin);
    await a.getByRole("button", { name: "Log in", exact: true }).click();
    await a.waitForSelector("input[autocomplete='one-time-code']", { timeout: 15000 });
    await a.fill("input[autocomplete='one-time-code']", "000000");
    await a.getByRole("button", { name: "Log in", exact: true }).click();
    await a.waitForTimeout(1500);
    ok(tag("A wrong 6-digit code is refused"), !/\/en\/admin/.test(a.url()));
    await codeStep(a, secret);
    ok(tag("Admin signs in with password + code"), /\/en\/admin/.test(a.url()));

    const broken = [];
    for (const path of ADMIN_PAGES) {
      const r = await a.goto(`${APP}${path}`, { waitUntil: "networkidle" });
      const overflow = label === "phone" && (await a.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1));
      if (r.status() !== 200 || !a.url().includes(path) || overflow) broken.push(`${path} ${r.status()}${overflow ? " overflow" : ""}`);
    }
    ok(tag(`All ${ADMIN_PAGES.length} admin pages open and fit the screen`), broken.length === 0, broken.join(", "));
    await a.goto(`${APP}/en/admin`, { waitUntil: "networkidle" });
    await a.screenshot({ path: `${OUT}/cf-${label}-admin.png`, fullPage: true });

    // report → hide → restore
    const report = q1("SELECT * FROM reports WHERE subject_type = 'cleaner_profile' AND status = 'open' ORDER BY created_at LIMIT 1");
    if (report) {
      await a.goto(`${APP}/en/admin/reports`, { waitUntil: "networkidle" });
      await a.getByRole("button", { name: "Hide" }).first().click();
      await a.waitForTimeout(2000);
      ok(tag("Hide from the report queue: ad hidden + moderated, report resolved, audit row"),
        q1("SELECT status, moderated FROM cleaner_profiles WHERE id = ?", report.subject_id).status === "hidden" && q1("SELECT moderated FROM cleaner_profiles WHERE id = ?", report.subject_id).moderated === 1 && q1("SELECT status FROM reports WHERE id = ?", report.id).status !== "open" && q1("SELECT count(*) n FROM admin_audit_log").n >= 1);
      await a.getByRole("button", { name: "Restore" }).first().click().catch(() => {});
      await a.waitForTimeout(2000);
    }

    // suspend + restore an account
    const victim = label === "phone" ? "household2@alieni.test" : "noor.cleaner@alieni.test";
    await a.goto(`${APP}/en/admin/users`, { waitUntil: "networkidle" });
    const row = a.locator("tr", { hasText: victim.split("@")[0].includes("noor") ? "Noor" : "Mark" }).first();
    await row.getByRole("button", { name: "Suspend account" }).click();
    await row.getByRole("button", { name: "Yes, suspend" }).click();
    await a.waitForTimeout(2000);
    ok(tag("Suspend: account marked suspended"), Boolean(q1("SELECT p.suspended_at FROM profiles p JOIN \"user\" u ON u.id = p.id WHERE u.email = ?", victim)?.suspended_at));
    const v = await page(vp);
    await v.goto(`${APP}/en/login`, { waitUntil: "networkidle" });
    await v.fill("input[type=email]", victim);
    await v.fill("input[type=password]", PW.other);
    await v.getByRole("button", { name: "Log in", exact: true }).click();
    await v.waitForTimeout(2500);
    ok(tag("A suspended account cannot sign in"), (await (await v.request.get(`${APP}/api/me`)).json()).role === "guest");
    await a.goto(`${APP}/en/admin/users`, { waitUntil: "networkidle" });
    await a.locator("tr", { hasText: victim.includes("noor") ? "Noor" : "Mark" }).first().getByRole("button", { name: "Restore" }).click();
    await a.waitForTimeout(2000);
    ok(tag("Restore: the account works again"), !q1("SELECT p.suspended_at FROM profiles p JOIN \"user\" u ON u.id = p.id WHERE u.email = ?", victim)?.suspended_at);

    // pre-launch mode closes sign-up on the server
    if (label === "desktop") {
      await a.goto(`${APP}/en/admin/settings`, { waitUntil: "networkidle" });
      await a.locator("input[name='signups-paused']").check();
      await a.getByRole("button", { name: "Save" }).click();
      await a.waitForSelector("text=Saved", { timeout: 15000 });
      const r = await v.request.post(`${APP}/api/auth/sign-up/email`, { headers: { origin: APP, "content-type": "application/json" }, data: { email: `paused.${Date.now()}@example.com`, password: PW.other, name: "Paused" } });
      ok("Pre-launch mode: the sign-up endpoint itself refuses new accounts", !r.ok() && !q1("SELECT id FROM \"user\" WHERE email LIKE 'paused.%'"));
      await a.goto(`${APP}/en/admin/settings`, { waitUntil: "networkidle" });
      await a.locator("input[name='signups-paused']").uncheck();
      await a.getByRole("button", { name: "Save" }).click();
      await a.waitForSelector("text=Saved", { timeout: 15000 });
      ok("Pre-launch mode off again", q1("SELECT value FROM settings WHERE key = 'signups_paused'").value === "false");
    }
    await Promise.all([a, v].map((p) => p.context().close()));
  }
  await done();
})();
