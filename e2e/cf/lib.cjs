/* Shared helpers for the Cloudflare end-to-end flows (see run.sh). */
const { chromium } = require("playwright");
const fs = require("node:fs");
const crypto = require("node:crypto");

const APP = process.env.APP || "http://127.0.0.1:8787";
const OUT = process.env.E2E_OUT || "e2e/out";
const VIEWPORTS = [
  ["phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }],
  ["desktop", { viewport: { width: 1280, height: 900 } }],
];
const PW = { household: "Test-Household-2026", cleaner: "Test-Cleaner-2026", business: "Test-Business-2026", admin: "Test-Admin-2026", other: "Test-Other-2026" };

/** Read-only view of the local D1 database (Miniflare's SQLite file). */
function db() {
  process.removeAllListeners("warning");
  const { DatabaseSync } = require("node:sqlite");
  const dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/";
  const f = fs.readdirSync(dir).find((x) => x.endsWith(".sqlite") && x !== "metadata.sqlite");
  return new DatabaseSync(dir + f, { readOnly: true });
}
const q = (sql, ...p) => { const d = db(); try { return d.prepare(sql).all(...p); } finally { d.close(); } };
const q1 = (sql, ...p) => q(sql, ...p)[0];

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) from a base32 secret or an otpauth:// URI. */
function totp(secretOrUri, offset = 0) {
  const m = /secret=([A-Z2-7]+)/i.exec(secretOrUri);
  const s = (m ? m[1] : secretOrUri).toUpperCase().replace(/=+$/, "");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = ""; for (const c of s) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = crypto.createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, "0");
}

function suite(name) {
  const results = [];
  const errors = [];
  const ok = (label, pass, detail = "") => { results.push({ name: label, pass: Boolean(pass), detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail && !pass ? "  — " + String(detail).slice(0, 200) : ""}`); };
  const track = (page) => {
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|status of (401|403|404|422|429)/.test(m.text())) errors.push(`console: ${m.text()}`); });
  };
  let browser;
  async function page(viewport) {
    browser = browser || (await chromium.launch());
    // Each browser context looks like a different visitor (Cloudflare sets cf-connecting-ip; it cannot be forged
    // there). Without this, every test account comes from one address and hits the real sign-up rate limit.
    const ip = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
    const ctx = await browser.newContext({ ...viewport, extraHTTPHeaders: { "cf-connecting-ip": ip } });
    const p = await ctx.newPage(); track(p);
    return p;
  }
  async function done() {
    ok("No unexpected browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(`${OUT}/${name}-results.json`, JSON.stringify(results, null, 2));
    if (browser) await browser.close();
    const failed = results.filter((r) => !r.pass).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  }
  return { ok, page, done, results };
}

const text = async (p, sel = "main") => ((await p.textContent(sel)) || "").replace(/\s+/g, " ");

async function login(p, email, password, { expect = /\/en\/(home|profile|admin|business\/dashboard|account\/two-factor)/ } = {}) {
  await p.goto(`${APP}/en/login`, { waitUntil: "networkidle" });
  await p.fill("input[type=email]", email);
  await p.fill("input[type=password]", password);
  await p.getByRole("button", { name: "Log in", exact: true }).click();
  if (expect) await p.waitForURL(expect, { timeout: 20000 });
  await p.waitForLoadState("networkidle");
}

async function signUp(p, email, role, name = email.split("@")[0]) {
  await p.goto(`${APP}/en/signup?role=${role}`, { waitUntil: "networkidle" });
  await p.fill("input[autocomplete='given-name']", name);
  await p.fill("input[type=email]", email);
  await p.fill("input[type=password]", PW.other);
  await p.getByRole("button", { name: "Create account" }).click();
  await p.waitForURL(/\/en\/(home|profile)/, { timeout: 20000 });
  await p.waitForLoadState("networkidle");
}

async function logout(p) {
  await p.context().clearCookies();
}

/** A 1600×1200 JPEG with camera and GPS EXIF tags ("SecretCamera"), to prove uploads lose their metadata. */
const PHOTO_WITH_EXIF = "e2e/cf/fixtures/photo-exif.jpg";

module.exports = { APP, OUT, VIEWPORTS, PW, q, q1, totp, suite, text, login, signUp, logout, PHOTO_WITH_EXIF };
