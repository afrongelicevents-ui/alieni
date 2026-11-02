/* Admin flow against the stand-in: a cleaner with a VOG, a household report,
 * then the owner (admin) reviews reports, VOG, ads, users and settings. */
const { chromium } = require("playwright");
const fs = require("node:fs");
const APP = "http://localhost:3100";
const EMU = "http://localhost:4000";
const OUT = process.env.E2E_OUT || "e2e/out";
const results = [];
function ok(name, pass, detail = "") { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); }
const tbl = async (n) => (await fetch(`${EMU}/__emu/table?name=${n}`)).json();
async function signUp(page, email, role) {
  await page.goto(`${APP}/en/signup?role=${role}`, { waitUntil: "networkidle" });
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", "Test-Password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/en\/account$/, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
}

(async () => {
  await fetch(`${EMU}/__emu/reset`);
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const track = (page) => {
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" && !/status of (400|404|422)/.test(m.text())) errors.push(`console: ${m.text()}`); });
  };

  // cleaner with school job type + VOG
  const cleanerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const cleaner = await cleanerCtx.newPage(); track(cleaner);
  await signUp(cleaner, "lotte@example.com", "cleaner");
  await cleaner.goto(`${APP}/en/cleaners/new`, { waitUntil: "networkidle" });
  await cleaner.fill("input[maxlength='80']", "Lotte B.");
  await cleaner.fill("input[maxlength='60']", "Groningen");
  await cleaner.getByRole("button", { name: "Next" }).click();
  await cleaner.getByRole("button", { name: /Regular cleaning/ }).first().click();
  await cleaner.getByRole("button", { name: /^School/ }).click();
  await cleaner.fill("input[placeholder='12345678']", "11112222");
  await cleaner.fill("input[type=date]", "2026-09-01");
  await cleaner.getByRole("button", { name: "Next" }).click();
  await cleaner.fill("input[placeholder='1012 AB']", "9711 AB");
  await cleaner.getByRole("button", { name: /Save ad|Publish/ }).click();
  await cleaner.waitForSelector("text=Your ad is live", { timeout: 15000 });
  // VOG file upload (second form on the page)
  await cleaner.locator("form").nth(1).locator("input[type=file]").setInputFiles("public/img/hero-cleaner.webp").catch(() => {});
  const vogForm = cleaner.locator("form", { hasText: "Upload VOG" });
  await vogForm.locator("input[type=file]").setInputFiles({ name: "vog.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
  await vogForm.getByRole("button", { name: "Upload VOG" }).click();
  await cleaner.waitForSelector("text=We review it within a few days", { timeout: 15000 });
  const vog = (await tbl("vog_documents"))[0];
  ok("Cleaner: VOG uploaded to private bucket, status pending", vog?.status === "pending" && Boolean(vog.storage_path));
  const ad = (await tbl("cleaner_profiles"))[0];

  // household reports the ad
  const hhCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const hh = await hhCtx.newPage(); track(hh);
  await signUp(hh, "pdevries@example.com", "household");
  await hh.goto(`${APP}/en/cleaners/${ad.id}`, { waitUntil: "networkidle" });
  await hh.getByRole("button", { name: /Report/ }).click();
  await hh.locator("input[value=fake]").check();
  await hh.fill("textarea", "Photo looks like a stock image.");
  await hh.getByRole("button", { name: /Send report|Submit/ }).click();
  await hh.waitForSelector("text=Thanks", { timeout: 15000 }).catch(() => {});
  ok("Household: report saved in reports table", (await tbl("reports")).length === 1, JSON.stringify((await tbl("reports"))[0]?.reason));

  // admin
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await adminCtx.newPage(); track(admin);
  await signUp(admin, "afrongelic.events@gmail.com", "household");
  await admin.goto(`${APP}/en/admin`, { waitUntil: "networkidle" });
  const dash = await admin.textContent("main");
  ok("Admin: dashboard counts 1 open report + 1 VOG to review", /1 open report/.test(dash) && /1 VOG to review/.test(dash));
  await admin.screenshot({ path: `${OUT}/f4-01-admin-dashboard.png` });

  await admin.goto(`${APP}/en/admin/reports`, { waitUntil: "networkidle" });
  ok("Admin: report queue shows the real report with cleaner name", /Lotte B\./.test(await admin.textContent("main")) && /pdevries/.test(await admin.textContent("main")));
  await admin.getByRole("button", { name: "Hide" }).click();
  await admin.waitForTimeout(2000);
  ok("Admin: hide → report resolved_hidden, ad hidden, audit logged", (await tbl("reports"))[0].status === "resolved_hidden" && (await tbl("cleaner_profiles"))[0].status === "hidden" && (await tbl("admin_audit_log")).length === 1);
  await hh.goto(`${APP}/en/search?q=9711AB`, { waitUntil: "networkidle" });
  ok("Hidden ad no longer in search", !/Lotte B\./.test(await hh.textContent("main")));
  await admin.getByRole("button", { name: "Restore" }).click();
  await admin.waitForTimeout(2000);
  ok("Admin: restore → ad published again", (await tbl("cleaner_profiles"))[0].status === "published");

  await admin.goto(`${APP}/en/admin/vog`, { waitUntil: "networkidle" });
  ok("Admin: VOG queue lists Lotte pending with file", /Lotte B\./.test(await admin.textContent("main")));
  await admin.getByRole("button", { name: "Approve" }).click();
  await admin.waitForTimeout(2000);
  ok("Admin: VOG approved and file deleted", (await tbl("vog_documents"))[0].status === "approved" && (await tbl("vog_documents"))[0].storage_path === null);
  await hh.goto(`${APP}/en/search?q=9711AB&jobType=school`, { waitUntil: "networkidle" });
  ok("Search: approved VOG shows the badge for schools", /VOG ✓/.test(await hh.textContent("main")));

  await admin.goto(`${APP}/en/admin/ads`, { waitUntil: "networkidle" });
  ok("Admin: ads list shows real ad with status online", /Lotte B\./.test(await admin.textContent("main")) && /online/.test(await admin.textContent("main")));
  await admin.goto(`${APP}/en/admin/users`, { waitUntil: "networkidle" });
  ok("Admin: users list shows the three accounts with roles", /cleaner/.test(await admin.textContent("main")) && /administrator/.test(await admin.textContent("main")) && /household/.test(await admin.textContent("main")));

  await admin.goto(`${APP}/en/admin/settings`, { waitUntil: "networkidle" });
  const first = admin.locator("form input[type=text]").first();
  await first.fill("16,95");
  await admin.getByRole("button", { name: "Save" }).click();
  await admin.waitForSelector("text=Saved", { timeout: 15000 });
  const settings = await tbl("settings");
  ok("Admin: settings saved to settings table (household fee 1695)", settings.find((s) => s.key === "household_fee_cents")?.value === 1695);
  await admin.reload({ waitUntil: "networkidle" });
  ok("Admin: settings page reloads with saved value", (await admin.locator("form input[type=text]").first().inputValue()) === "16,95");

  // non-admin cannot act
  await hh.goto(`${APP}/en/admin/settings`, { waitUntil: "networkidle" });
  ok("Access: household gets 404 on admin pages", /404/.test(await hh.textContent("body")));

  ok("No unexpected browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  fs.writeFileSync(`${OUT}/flow4-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
