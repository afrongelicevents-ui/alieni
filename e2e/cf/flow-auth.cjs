/* Logins on the real Worker (phone + desktop): the seeded household, cleaner and business test accounts log in and
 * land on their own home; a wrong password is refused; signing out ends the session; a new household signs up;
 * nobody can sign themselves up as admin; the session cookie is HttpOnly; password reset answers without leaking. */
const { APP, VIEWPORTS, PW, q1, suite, text, login, signUp } = require("./lib.cjs");

(async () => {
  const { ok, page, done } = suite("flow-auth");
  for (const [label, vp] of VIEWPORTS) {
    const tag = (t) => `[${label}] ${t}`;
    const s = `${label}${Date.now() % 100000}`;
    for (const [role, email, home] of [["household", "household@alieni.test", /\/en\/home$/], ["cleaner", "cleaner@alieni.test", /\/en\/(home|profile)$/], ["business", "business@alieni.test", /\/en\/business\/dashboard$/]]) {
      const p = await page(vp);
      await login(p, email, PW[role]);
      ok(tag(`Test login ${role}: lands on its own page`), home.test(p.url()), p.url());
      const cookies = await p.context().cookies();
      const sess = cookies.find((c) => /session_token/.test(c.name));
      ok(tag(`${role}: session cookie is HttpOnly and SameSite=Lax`), Boolean(sess?.httpOnly) && sess?.sameSite === "Lax", JSON.stringify(sess && { n: sess.name, h: sess.httpOnly, s: sess.sameSite }));
      const me = await (await p.request.get(`${APP}/api/me`)).json();
      ok(tag(`${role}: the server knows the role`), me.role === role, JSON.stringify(me));
      await p.goto(`${APP}/en/account`, { waitUntil: "networkidle" });
      await p.getByRole("button", { name: /Log out/ }).first().click();
      await p.waitForTimeout(1500);
      ok(tag(`${role}: log out ends the session`), (await (await p.request.get(`${APP}/api/me`)).json()).role === "guest");
      await p.context().close();
    }

    const w = await page(vp);
    await w.goto(`${APP}/en/login`, { waitUntil: "networkidle" });
    await w.fill("input[type=email]", "household@alieni.test");
    await w.fill("input[type=password]", "wrong-password-123");
    await w.getByRole("button", { name: "Log in", exact: true }).click();
    await w.waitForTimeout(2000);
    ok(tag("Wrong password: refused with a plain message"), /\/en\/login/.test(w.url()) && /(wrong|incorrect|invalid|onjuist)/i.test(await text(w)));

    const email = `new.household.${s}@example.com`;
    await signUp(w, email, "household", "Nieuw Huishouden");
    ok(tag("New household signs up and lands on home"), /\/en\/home$/.test(w.url()) && q1("SELECT p.role FROM profiles p JOIN \"user\" u ON u.id = p.id WHERE u.email = ?", email)?.role === "household");

    const res = await w.request.post(`${APP}/api/auth/sign-up/email`, { headers: { origin: APP, "content-type": "application/json" }, data: { email: `sneaky.${s}@example.com`, password: PW.other, name: "Sneaky", role: "admin" } });
    ok(tag("Signing up with role=admin gives a household account"), res.ok() && q1("SELECT p.role FROM profiles p JOIN \"user\" u ON u.id = p.id WHERE u.email = ?", `sneaky.${s}@example.com`)?.role === "household");

    const reset = await w.request.post(`${APP}/api/auth/request-password-reset`, { headers: { origin: APP, "content-type": "application/json" }, data: { email: "nobody@example.com", redirectTo: "/en/reset-password/update" } });
    ok(tag("Password reset for an unknown address answers the same (no account leak)"), reset.status() === 200);
    await w.context().close();
  }
  await done();
})();
