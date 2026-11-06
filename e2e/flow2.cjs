/* Household ↔ cleaner flow against the stand-in: cleaner publishes an ad,
 * household finds it, favourites, requests a meeting, chats (masked),
 * both confirm the deal, contacts unlock. */
const { chromium } = require("playwright");
const fs = require("node:fs");
const APP = "http://localhost:3100";
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

(async () => {
  await fetch(`${EMU}/__emu/reset`);
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const track = (page) => {
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" && !/status of (400|404|422)|realtime\/v1\/websocket/.test(m.text())) errors.push(`console: ${m.text()}`); });
  };

  // ---------- Cleaner: sign up, publish ad ----------
  const cleanerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const cleaner = await cleanerCtx.newPage(); track(cleaner);
  await signUp(cleaner, "sandra@example.com", "cleaner");
  await cleaner.goto(`${APP}/en/account`, { waitUntil: "networkidle" });
  ok("Cleaner: account created with role cleaner", (await cleaner.textContent("main")).includes("Cleaner"));
  await cleaner.goto(`${APP}/en/cleaners/new`, { waitUntil: "networkidle" });
  await cleaner.fill("input[maxlength='80']", "Sandra M.");
  await cleaner.fill("input[maxlength='60']", "Amsterdam");
  await cleaner.fill("textarea", "Ten years of experience, thorough and friendly.");
  await cleaner.getByRole("button", { name: "Next" }).click();
  await cleaner.getByRole("button", { name: /Regular cleaning|Regulier/ }).first().click();
  await cleaner.getByRole("button", { name: "Next" }).click();
  await cleaner.fill("input[placeholder='1012 AB']", "1012 AB");
  // availability: Monday morning + Thursday afternoon
  await cleaner.locator("td button").nth(0).click();
  await cleaner.locator("td button").nth(10).click();
  await cleaner.getByRole("button", { name: /Save ad|Publish/ }).click();
  await cleaner.waitForSelector("text=Your ad is live", { timeout: 15000 });
  const adRow = (await (await fetch(`${EMU}/__emu/table?name=cleaner_profiles`)).json())[0];
  ok("Cleaner: ad published to cleaner_profiles with location + availability", Boolean(adRow && adRow.status === "published" && adRow.location && (await (await fetch(`${EMU}/__emu/table?name=availability_slots`)).json()).length === 2), JSON.stringify({ status: adRow?.status, postcode: adRow?.postcode, location: adRow?.location }));
  await cleaner.screenshot({ path: `${OUT}/f2-01-ad-live.png`, fullPage: true });
  // photo upload
  await cleaner.locator("form input[type=file]").first().setInputFiles("public/img/hero-cleaner.webp");
  await cleaner.getByRole("button", { name: "Save photo" }).click();
  await cleaner.waitForSelector("text=Photo saved", { timeout: 15000 });
  ok("Cleaner: profile photo uploaded to profile-photos bucket", (await (await fetch(`${EMU}/__emu/state`)).json()).objects.some((k) => k.startsWith("profile-photos/")));
  await cleaner.goto(`${APP}/en/home`, { waitUntil: "networkidle" });
  ok("Cleaner: home shows ad online", (await cleaner.textContent("main")).includes("online"));

  // ---------- Household: find, favourite, request meeting ----------
  const hhCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const hh = await hhCtx.newPage(); track(hh);
  await signUp(hh, "jansen@example.com", "household");
  await hh.goto(`${APP}/en/search?q=1012AB`, { waitUntil: "networkidle" });
  ok("Household: search shows the real cleaner with photo", (await hh.textContent("main")).includes("Sandra M.") && (await hh.locator("article img[src*='profile-photos']").count()) > 0);
  await hh.getByRole("link", { name: "View profile" }).first().click();
  await hh.waitForURL(/\/en\/cleaners\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await hh.waitForLoadState("networkidle");
  await hh.getByRole("button", { name: /Save as favourite/ }).first().click();
  await hh.waitForTimeout(800);
  ok("Household: favourite saved in favourites table", (await (await fetch(`${EMU}/__emu/table?name=favourites`)).json()).length === 1);
  await hh.getByRole("button", { name: /Request a meeting|Kennismaking/ }).click();
  await hh.locator("label", { hasText: /Monday/ }).first().click();
  await hh.fill("textarea", "Hi Sandra, call me on 06 12345678 or mail jansen@example.com");
  await hh.getByRole("button", { name: /Send request/ }).click();
  await hh.waitForURL(/\/en\/messages\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await hh.waitForLoadState("networkidle");
  const threadUrl = hh.url();
  const firstMsg = (await (await fetch(`${EMU}/__emu/table?name=messages`)).json())[0];
  ok("Household: meeting request + conversation + first message created", Boolean(firstMsg) && (await (await fetch(`${EMU}/__emu/table?name=meeting_requests`)).json()).length === 1);
  ok("Masking: phone and e-mail hidden in the stored message", Boolean(firstMsg) && !firstMsg.body.includes("12345678") && !firstMsg.body.includes("jansen@") && firstMsg.masked === true, firstMsg?.body);
  await hh.screenshot({ path: `${OUT}/f2-02-household-thread.png`, fullPage: true });

  // ---------- Cleaner: sees request, accepts, replies ----------
  await cleaner.goto(`${APP}/en/messages`, { waitUntil: "networkidle" });
  ok("Cleaner: conversation listed with household name", (await cleaner.textContent("main")).includes("jansen"));
  await cleaner.getByRole("link", { name: /jansen/ }).click();
  await cleaner.waitForURL(/\/en\/messages\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await cleaner.waitForLoadState("networkidle");
  await cleaner.getByRole("button", { name: "Accept" }).click();
  await cleaner.waitForTimeout(1500);
  const mr = (await (await fetch(`${EMU}/__emu/table?name=meeting_requests`)).json())[0];
  ok("Cleaner: meeting accepted", mr.status === "accepted");
  await cleaner.fill("#chat-draft", "Great, Monday 9:30 works. My number is 0687654321");
  await cleaner.keyboard.press("Enter");
  await cleaner.waitForTimeout(2500);
  const msgs = await (await fetch(`${EMU}/__emu/table?name=messages`)).json();
  ok("Cleaner: reply stored and masked", msgs.length === 2 && !msgs[1].body.includes("0687654321"), msgs[1]?.body);

  // ---------- Deal: both confirm ----------
  await hh.goto(threadUrl, { waitUntil: "networkidle" });
  ok("Household: sees cleaner's reply (masked)", (await hh.textContent("main")).includes("Monday 9:30"));
  await hh.getByRole("button", { name: /We have a deal/ }).click();
  await hh.waitForTimeout(1500);
  ok("Household: deal confirmation stored (pending)", (await (await fetch(`${EMU}/__emu/table?name=connections`)).json())[0]?.household_confirmed_at != null);
  await cleaner.goto(cleaner.url(), { waitUntil: "networkidle" });
  ok("Cleaner: sees 'confirmed the deal' prompt", (await cleaner.textContent("main")).includes("confirmed the deal"));
  await cleaner.getByRole("button", { name: /We have a deal/ }).click();
  await cleaner.waitForTimeout(1500);
  const conn = (await (await fetch(`${EMU}/__emu/table?name=connections`)).json())[0];
  ok("Deal: connection active after both confirmed", conn?.status === "active" && Boolean(conn.started_at));
  await cleaner.goto(cleaner.url(), { waitUntil: "networkidle" });
  ok("Cleaner: 'You are connected' shown", (await cleaner.textContent("main")).includes("connected"));
  await cleaner.fill("#chat-draft", "Now you can reach me on 0687654321");
  await cleaner.keyboard.press("Enter");
  await cleaner.waitForTimeout(2500);
  const after = await (await fetch(`${EMU}/__emu/table?name=messages`)).json();
  ok("Unlocked: contact details stored unmasked after the deal", after.length === 3 && after[2].body.includes("0687654321") && after[2].masked === false);
  await hh.goto(threadUrl, { waitUntil: "networkidle" });
  ok("Household: sees the phone number now", (await hh.textContent("main")).includes("0687654321"));
  await hh.screenshot({ path: `${OUT}/f2-03-connected.png`, fullPage: true });
  await hh.goto(`${APP}/en/home`, { waitUntil: "networkidle" });
  ok("Household: home shows the connected cleaner", /Sandra M\./.test(await hh.textContent("main")) && /Connected/.test(await hh.textContent("main")));
  ok("Cleaner: verified jobs counter incremented", ((await (await fetch(`${EMU}/__emu/table?name=cleaner_profiles`)).json())[0].verified_jobs_count) === 1);

  // ---------- Access control ----------
  const strangerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const stranger = await strangerCtx.newPage(); track(stranger);
  await signUp(stranger, "stranger@example.com", "household");
  await stranger.goto(threadUrl, { waitUntil: "networkidle" });
  ok("Access: a third user cannot open the conversation", (await stranger.textContent("main")).includes("does not exist"));

  ok("No unexpected browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  fs.writeFileSync(`${OUT}/flow2-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
