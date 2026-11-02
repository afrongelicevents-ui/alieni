const { chromium } = require("playwright");
const fs = require("node:fs");
const APP = "http://localhost:3100";
const EMU = "http://localhost:4000";
const OUT = process.env.E2E_OUT || "e2e/out";
const results = [];
function ok(name, pass, detail = "") { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); }

(async () => {
  await fetch(`${EMU}/__emu/reset`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/status of (400|422)/.test(m.text())) errors.push(`console: ${m.text()}`); });
  page.on("response", (r) => { const u = r.url(); if (r.status() >= 400 && !u.includes("/auth/v1/") && !u.includes("/en/admin")) errors.push(`${r.status()} ${u}`); });

  // 1. Sign-up validates empty fields natively
  await page.goto(`${APP}/en/signup`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Create account" }).click();
  const invalid = await page.evaluate(() => !document.querySelector("form").checkValidity());
  ok("Sign-up: empty form is blocked by validation", invalid);

  // 2. Weak password → server error shown
  await page.fill("#email, input[type=email]", "afrongelic.events@gmail.com");
  await page.fill("input[type=password]", "short");
  await page.getByRole("button", { name: "Create account" }).click();
  const weakBlocked = await page.evaluate(() => !document.querySelector("form").checkValidity());
  ok("Sign-up: password under 8 chars is blocked", weakBlocked);

  // 3. Real sign-up → lands on account page, signed in, admin link
  await page.fill("input[type=password]", "Test-Password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/en\/account$/, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT}/01-after-signup.png` });
  ok("Sign-up: redirected to /en/account", /\/en\/account$/.test(page.url()), page.url());
  const body = await page.textContent("body");
  ok("Account page: shows 'Signed in as' + email", body.includes("Signed in as") && body.includes("afrongelic.events@gmail.com"));
  ok("Account page: shows Admin dashboard link (owner is admin)", (await page.getByRole("link", { name: /Admin dashboard/ }).count()) === 1);
  ok("Header: shows single Account button when signed in", (await page.locator("header").textContent()).includes("Account") && !(await page.locator("header").textContent()).includes("Log in"));
  const state = await (await fetch(`${EMU}/__emu/state`)).json();
  ok("Database: account saved with role admin", state.users.length === 1 && state.users[0].role === "admin", JSON.stringify(state.users));

  // 4. Admin → Photos
  await page.getByRole("link", { name: /Admin dashboard/ }).click();
  await page.waitForURL(/\/en\/admin$/, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
  ok("Admin: dashboard opens for admin (no 404)", /\/en\/admin$/.test(page.url()) && (await page.textContent("body")).includes("Alieni Admin"), page.url());
  await page.getByRole("link", { name: "Photos" }).click();
  await page.waitForURL(/\/en\/admin\/media$/, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
  const cards = await page.locator("article").count();
  ok("Admin → Photos: six photo cards", cards === 6, `${cards} cards`);
  await page.screenshot({ path: `${OUT}/02-admin-photos.png`, fullPage: true });

  // 5. Upload a photo for the hero slot
  const heroCard = page.locator("article").first();
  await heroCard.locator("input[type=file]").setInputFiles("public/img/hero-cleaner.webp");
  await heroCard.getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(4000);
  await page.waitForLoadState("networkidle");
  const heroText = await page.locator("article").first().textContent();
  ok("Admin → Photos: upload saved + 'uploaded' badge", heroText.includes("Saved") || heroText.includes("uploaded"), heroText.slice(0, 120));
  const st2 = await (await fetch(`${EMU}/__emu/state`)).json();
  ok("Storage: file stored in site-media bucket + row in site_media", st2.objects.length === 1 && st2.siteMedia.length === 1, JSON.stringify({ objects: st2.objects, rows: st2.siteMedia.map((r) => r.slot) }));
  await page.screenshot({ path: `${OUT}/03-after-upload.png`, fullPage: true });

  // 6. Home shows uploaded hero (desktop width, hero is hidden on phones by design)
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const dpage = await desk.newPage();
  await dpage.goto(`${APP}/en`, { waitUntil: "networkidle" });
  const heroSrc = await dpage.locator("section img[src*='storage'], section img[src*='_next/image']").first().getAttribute("src").catch(() => null);
  ok("Home: hero image now comes from storage (uploaded photo)", Boolean(heroSrc && decodeURIComponent(heroSrc).includes("site-media")), heroSrc || "no img");
  await dpage.screenshot({ path: `${OUT}/04-home-desktop.png` });
  await desk.close();

  // 7. Log out → header back to Log in / Sign up
  await page.goto(`${APP}/en/account`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL(/\/en\/?$/, { timeout: 10000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
  ok("Log out: back on home, header shows Log in", (await page.locator("header").textContent()).includes("Log in"), page.url());
  errors.push("__expect404__");
  await page.goto(`${APP}/en/admin`, { waitUntil: "networkidle" });
  errors.splice(errors.indexOf("__expect404__"), 2);
  ok("Admin: hidden (404) when logged out", (await page.textContent("body")).includes("404") || page.url().includes("404"));

  // 8. Login: wrong password shows friendly error, right password works
  await page.goto(`${APP}/en/login`, { waitUntil: "networkidle" });
  await page.fill("input[type=email]", "afrongelic.events@gmail.com");
  await page.fill("input[type=password]", "wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForTimeout(1500);
  ok("Log in: wrong password shows plain-language error", (await page.textContent("form")).includes("Email address or password is incorrect"));
  await page.screenshot({ path: `${OUT}/05-login-error.png` });
  await page.fill("input[type=password]", "Test-Password-123");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/en\/account$/, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
  ok("Log in: correct password → account page", /\/en\/account$/.test(page.url()) && (await page.textContent("body")).includes("Signed in as"), page.url());

  // 9. Duplicate sign-up shows 'already has an account'
  await page.goto(`${APP}/en/account`); await page.getByRole("button", { name: "Log out" }).click(); await page.waitForTimeout(1000);
  await page.goto(`${APP}/en/signup`, { waitUntil: "networkidle" });
  await page.fill("input[type=email]", "afrongelic.events@gmail.com");
  await page.fill("input[type=password]", "Test-Password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForTimeout(1500);
  ok("Sign-up: existing email shows 'already has an account'", (await page.textContent("form")).includes("already has an account"));

  // 10. Dutch flow once (default locale, fresh browser so no language cookie)
  const nlctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const nl = await nlctx.newPage();
  await nl.goto(`${APP}/signup`, { waitUntil: "networkidle" });
  await nl.fill("input[type=email]", "tester@example.com");
  await nl.fill("input[type=password]", "Test-Password-123");
  await nl.getByRole("button", { name: "Account aanmaken" }).click();
  await nl.waitForURL(/\/account$/, { timeout: 15000 }).catch(() => {});
  await nl.waitForLoadState("networkidle");
  const nlBody = await nl.textContent("main");
  const nlAdminLinks = await nl.getByRole("link", { name: /Admin-dashboard/ }).count();
  ok("Dutch sign-up (second user): account page, household role, no admin link", /\/account$/.test(nl.url()) && nlBody.includes("Ingelogd als") && nlBody.includes("Huishouden") && nlAdminLinks === 0, `${nl.url()} adminLinks=${nlAdminLinks}`);
  await nl.screenshot({ path: `${OUT}/06-account-nl.png` });
  await nlctx.close();

  ok("No browser errors during the whole flow", errors.length === 0, errors.slice(0, 3).join(" | "));
  fs.writeFileSync(`${OUT}/flow-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
