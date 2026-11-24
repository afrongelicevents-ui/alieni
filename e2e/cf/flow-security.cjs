/* Security probes against the real Worker: what an attacker can try from outside, and what one signed-in user can try
 * against another. Every check must be refused by the SERVER (no browser UI involved). */
const { APP, VIEWPORTS, PW, q1, suite, text, login } = require("./lib.cjs");

(async () => {
  const { ok, page, done } = suite("flow-security");
  const [, desktop] = VIEWPORTS;
  const p = await page(desktop[1]);
  const r = p.request;
  const status = async (url, opts) => (await r.fetch(`${APP}${url}`, opts)).status();

  // ---------- files ----------
  ok("Files: no link → 404", (await status("/api/files/profile/x/0b5f8f9e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.webp")) === 404);
  ok("Files: forged signature → 404", (await status("/api/files/profile/x/0b5f8f9e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.webp?e=9999999999&s=" + "0".repeat(64))) === 404);
  ok("Files: path traversal → 404", (await status("/api/files/..%2F..%2Fwrangler.jsonc?e=9999999999&s=" + "a".repeat(64))) === 404);
  ok("Files: expired link → 404", (await status("/api/files/profile/x/0b5f8f9e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.webp?e=1000&s=" + "a".repeat(64))) === 404);

  // ---------- routes that need a secret or a session ----------
  ok("Cron: refused without the secret", [401, 403].includes(await status("/api/cron/daily")));
  ok("Cron: refused with a wrong secret", [401, 403].includes(await status("/api/cron/daily", { headers: { authorization: "Bearer nope" } })));
  ok("Data export: refused when signed out", [401, 403].includes(await status("/api/account/export")));
  ok("/api/me tells a visitor only 'guest'", JSON.stringify(await (await r.get(`${APP}/api/me`)).json()) === '{"role":"guest"}');

  // ---------- auth endpoint hardening ----------
  const cross = await r.post(`${APP}/api/auth/sign-in/email`, { headers: { origin: "https://evil.example", "content-type": "application/json" }, data: { email: "household@alieni.test", password: PW.household } });
  ok("Sign-in from a foreign site (CSRF) is refused", cross.status() === 403, cross.status());
  let limited = false;
  for (let i = 0; i < 12; i++) {
    const a = await r.post(`${APP}/api/auth/sign-in/email`, { headers: { origin: APP, "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" }, data: { email: "household@alieni.test", password: `wrong-${i}` } });
    if (a.status() === 429) { limited = true; break; }
  }
  ok("Password guessing is rate-limited (429)", limited);

  // ---------- headers ----------
  const home = await r.get(`${APP}/nl`);
  const h = home.headers();
  ok("Security headers: CSP, HSTS, nosniff, no framing", /default-src 'self'/.test(h["content-security-policy"] || "") && /max-age/.test(h["strict-transport-security"] || "") && h["x-content-type-options"] === "nosniff" && h["x-frame-options"] === "DENY");

  // ---------- one user against another ----------
  const conv = q1("SELECT c.id FROM conversations c JOIN \"user\" u ON u.id = c.household_id WHERE u.email = 'household@alieni.test'").id;
  const draft = q1("SELECT id FROM cleaner_profiles WHERE status = 'draft' LIMIT 1").id;
  const biz = await page(desktop[1]);
  await login(biz, "business@alieni.test", PW.business);
  await biz.goto(`${APP}/en/messages/${conv}`, { waitUntil: "networkidle" });
  ok("A business cannot read a household's chat", !(await text(biz)).includes("Utrecht-Centrum") && !(await text(biz)).includes("12345678"));
  const exp = await (await biz.request.get(`${APP}/api/account/export`)).text();
  ok("Data export contains only the signed-in person's data", exp.includes("business@alieni.test") && !exp.includes("household@alieni.test") && !exp.includes("Utrecht-Centrum"));
  await biz.goto(`${APP}/en/admin`, { waitUntil: "networkidle" });
  ok("A business cannot open admin", !biz.url().includes("/admin"));
  const cl = await page(desktop[1]);
  await login(cl, "cleaner@alieni.test", PW.cleaner);
  const d = await cl.goto(`${APP}/en/cleaners/${draft}`, { waitUntil: "networkidle" });
  ok("A cleaner cannot see another cleaner's draft ad", d.status() === 404 || !(await text(cl, "body")).includes("Sara Draft"));
  await cl.goto(`${APP}/en/business/requests`, { waitUntil: "networkidle" });
  ok("A cleaner cannot open the business requests page", !cl.url().includes("/business/requests"));
  await done();
})();
