/* Pre-launch mode (Admin → Settings → Sign-ups): when on, the household/cleaner and business sign-up screens say
 * "we are launching soon" and create no account; logging in keeps working. Off (the default) = sign-ups open.
 * Also the cleaner sign-up eyebrow text. App on :3100 (or APP). */
const { chromium } = require("playwright");
const fs = require("node:fs");
const APP = process.env.APP || "http://localhost:3100";
const EMU = "http://localhost:4000";
const OUT = process.env.E2E_OUT || "e2e/out";
const results = [];
function ok(name, pass, detail = "") { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); }
const tbl = async (name) => (await fetch(`${EMU}/__emu/table?name=${name}`)).json();
const setting = async (key) => (await tbl("settings")).find((s) => s.key === key)?.value;

async function signUp(page, email, role) {
  await page.goto(`${APP}/en/signup?role=${role}`, { waitUntil: "networkidle" });
  await page.fill("input[type=email]", email);
  await page.fill("input[autocomplete='given-name']", email.split("@")[0]);
  await page.fill("input[type=password]", "Test-Password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/en\/(home|profile|admin|business\/dashboard)$/, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
}

async function setPaused(admin, on) {
  await admin.goto(`${APP}/en/admin/settings`, { waitUntil: "networkidle" });
  const box = admin.locator("input[name='signups-paused']");
  if (on) await box.check(); else await box.uncheck();
  await admin.getByRole("button", { name: "Save" }).click();
  await admin.waitForSelector("text=Saved", { timeout: 15000 });
}

(async () => {
  await fetch(`${EMU}/__emu/reset`);
  const browser = await chromium.launch();
  const errors = [];
  const track = (p) => { p.on("pageerror", (e) => errors.push("pageerror: " + e.message)); p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); }); };

  // ---- default: open ----
  const v = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage(); track(v);
  await v.goto(`${APP}/en/signup?role=cleaner`, { waitUntil: "networkidle" });
  ok("Default: sign-up open (no message, button enabled)", (await v.locator("[data-signup-closed]").count()) === 0 && await v.getByRole("button", { name: "Create account" }).isEnabled());
  ok("Cleaner sign-up eyebrow: \"I'm a cleaner looking for work\"", /I'm a cleaner looking for work/.test(await v.textContent("main")));
  await v.goto(`${APP}/nl/signup?role=cleaner`, { waitUntil: "networkidle" });
  ok("NL eyebrow: \"Ik ben schoonmaker en zoek werk\"", /Ik ben schoonmaker en zoek werk/.test(await v.textContent("main")));

  // ---- admin switches pre-launch mode on ----
  const admin = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); track(admin);
  await signUp(admin, "afrongelic.events@gmail.com", "household"); // allow-listed: becomes admin
  await admin.goto(`${APP}/en/admin/settings`, { waitUntil: "networkidle" });
  ok("Admin → Settings shows the Sign-ups switch, off", (await admin.locator("[data-signups] input[name='signups-paused']").count()) === 1 && !(await admin.locator("input[name='signups-paused']").isChecked()));
  await setPaused(admin, true);
  ok("Saved as settings.signups_paused = true", (await setting("signups_paused")) === true);
  await admin.reload({ waitUntil: "networkidle" });
  ok("Settings page reloads with the switch on", await admin.locator("input[name='signups-paused']").isChecked());

  for (const role of ["household", "cleaner"]) {
    await v.goto(`${APP}/en/signup?role=${role}`, { waitUntil: "networkidle" });
    ok(`Paused: ${role} sign-up says launching soon, fields and button disabled`,
      (await v.locator("[data-signup-closed='paused']").count()) === 1 && /launching soon/.test(await v.textContent("main")) && await v.getByRole("button", { name: "Create account" }).isDisabled() && await v.locator("input[type=email]").isDisabled());
  }
  await v.goto(`${APP}/en/business/signup?type=office`, { waitUntil: "networkidle" });
  ok("Paused: business sign-up says launching soon", (await v.locator("[data-signup-closed='paused']").count()) === 1);
  const before = (await tbl("profiles")).length;
  await v.fill("input[autocomplete='given-name']", "Pre");
  await v.fill("input[autocomplete='family-name']", "Launch");
  await v.fill("input[type=email]", "pre.launch@example.com");
  await v.fill("input[type=password]", "Test-Password-123");
  await v.locator("input").nth(4).fill("Pre Launch BV");
  for (let i = 0; i < 3; i++) await v.getByRole("button", { name: "Next" }).click();
  await v.fill("input[autocomplete='street-address']", "Kade 1");
  await v.fill("input[placeholder='1012 AB']", "1011 AB");
  await v.locator("fieldset input").nth(3).fill("Amsterdam");
  await v.getByRole("button", { name: /Go to my dashboard/ }).click();
  await v.waitForTimeout(1500);
  ok("Paused: finishing the business wizard creates no account", (await tbl("profiles")).length === before && /launching soon/.test(await v.textContent("main")));
  await v.goto(`${APP}/en/login`, { waitUntil: "networkidle" });
  ok("Paused: the log-in page still works", (await v.locator("[data-signup-closed]").count()) === 0 && await v.getByRole("button", { name: "Log in" }).isEnabled());

  // ---- back on ----
  await setPaused(admin, false);
  await v.goto(`${APP}/en/signup?role=household`, { waitUntil: "networkidle" });
  ok("Switched off again: sign-up open", (await setting("signups_paused")) === false && (await v.locator("[data-signup-closed]").count()) === 0 && await v.getByRole("button", { name: "Create account" }).isEnabled());

  ok("No unexpected browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/flow16-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
