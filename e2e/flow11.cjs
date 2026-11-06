/* Part 16 — privacy rights: "Download my data" and "Delete my account" (needs the app to run with a service key,
 * see e2e/README.md: SUPABASE_SERVICE_ROLE_KEY=emu-service-key on port 3101). Also the public ad privacy (area only)
 * and the company details on the legal pages (no placeholders). */
const { chromium } = require("playwright");
const fs = require("node:fs");
const APP = process.env.APP || "http://localhost:3101";
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
const tbl = async (name) => (await fetch(`${EMU}/__emu/table?name=${name}`)).json();

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const track = (page) => { page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`)); page.on("console", (m) => { if (m.type() === "error" && !/status of (400|401|404|422)|realtime\/v1\/websocket/.test(m.text())) errors.push(`console: ${m.text()}`); }); };

  for (const [label, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 900 }]]) {
    await fetch(`${EMU}/__emu/reset`);
    const sfx = label === "phone" ? "m" : "d";

    // legal pages: no placeholders
    const g = await (await browser.newContext({ viewport })).newPage(); track(g);
    for (const path of ["privacy", "terms"]) {
      await g.goto(`${APP}/en/${path}`, { waitUntil: "networkidle" });
      const text = await g.textContent("main");
      ok(`[${label}] The ${path} page shows no [NUMMER] placeholder`, !/\[NUMMER\]|\[TO FILL\]/.test(text));
    }
    await g.goto(`${APP}/en/privacy`, { waitUntil: "networkidle" });
    ok(`[${label}] The privacy page points to the Account page for download and deletion`, /download it as a file and delete your account on the Account page/.test(await g.textContent("main")));

    // a household with a conversation-less account: export and delete
    const ctx = await browser.newContext({ viewport, acceptDownloads: true }); const p = await ctx.newPage(); track(p);
    const email = `hh-${sfx}@example.com`;
    await signUp(p, email, "household");
    await p.goto(`${APP}/en/account`, { waitUntil: "networkidle" });
    ok(`[${label}] The account page offers download and delete`, (await p.locator("[data-account-data]").count()) === 1 && (await p.getByRole("link", { name: "Download my data" }).count()) === 1);
    const [download] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "Download my data" }).click()]);
    const file = await download.path(); const exported = JSON.parse(fs.readFileSync(file, "utf8"));
    ok(`[${label}] The export is a JSON file with the account and profile`, exported.account?.email === email && exported.profile?.role === "household" && /alieni-my-data-/.test(download.suggestedFilename()));
    ok(`[${label}] The export holds no payment-provider id or exact location`, !/mollie|"location"/i.test(JSON.stringify(exported)));
    await p.getByRole("button", { name: "Delete my account" }).click();
    const confirm = p.getByRole("button", { name: "Yes, delete my account" });
    ok(`[${label}] The delete button stays disabled until the e-mail address is typed`, await confirm.isDisabled());
    await p.fill("#delete-email", "someone-else@example.com");
    ok(`[${label}] A different e-mail address does not enable it`, await confirm.isDisabled());
    await p.fill("#delete-email", email);
    await confirm.click();
    await p.waitForURL(/\/(nl|en)?\/?$/, { timeout: 20000 });
    const profiles = await tbl("profiles");
    ok(`[${label}] After deletion the account is gone`, !profiles.some((x) => x.display_name && x.id && x.role === "household") || profiles.every((x) => x.display_name === "Verwijderde gebruiker"));
    await p.goto(`${APP}/en/account`, { waitUntil: "networkidle" });
    ok(`[${label}] The session is signed out afterwards`, (await p.getByRole("link", { name: /Log in/ }).count()) > 0 || /Log in|Sign up|Create/.test(await p.textContent("main")));
    await ctx.close(); await g.context().close();

    // public ad privacy: area only
    const cctx = await browser.newContext({ viewport }); const c = await cctx.newPage(); track(c);
    await signUp(c, `cl-${sfx}@example.com`, "cleaner");
    const cookies = await cctx.cookies();
    const raw = cookies.filter((x) => /^sb-.*-auth-token(\.\d+)?$/.test(x.name)).sort((a, b) => a.name.localeCompare(b.name)).map((x) => x.value).join("");
    const sess = JSON.parse(raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64").toString() : decodeURIComponent(raw));
    await fetch(`${EMU}/rest/v1/cleaner_profiles`, { method: "POST", headers: { apikey: "emu-anon-key", Authorization: `Bearer ${sess.access_token}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ user_id: sess.user.id, status: "published", rate_cents: 2200, min_hours: 2, services: ["regular"], languages: ["nl"], postcode: "7433 RB", radius_km: 15, job_types: ["household"], work_scope: "household", location: "SRID=4326;POINT(6.2200 52.3000)" }) });
    const cp = (await tbl("cleaner_profiles"))[0];
    const g2 = await (await browser.newContext({ viewport })).newPage(); track(g2);
    await g2.goto(`${APP}/en/cleaners/${cp.id}`, { waitUntil: "networkidle" });
    const body = await g2.textContent("main");
    ok(`[${label}] The public ad shows the 4-digit area, never the full postcode`, /from 7433(?!\d)/.test(body) && !/7433 ?RB/.test(body), body.slice(0, 200));
    await cctx.close(); await g2.context().close();
  }

  ok("No unexpected browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  fs.writeFileSync(`${OUT}/flow11-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
