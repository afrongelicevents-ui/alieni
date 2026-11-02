const { chromium } = require("playwright");
const fs = require("node:fs");
const APP = "http://localhost:3100";
const OUT = process.env.E2E_OUT || "e2e/out";
const start = ["/", "/en"];
(async () => {
  const browser = await chromium.launch();
  const seen = new Set(); const queue = [...start]; const rows = [];
  const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const ctxD = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  while (queue.length) {
    const path = queue.shift(); if (seen.has(path)) continue; seen.add(path);
    const row = { path, mobile: {}, desktop: {} };
    for (const [name, ctx] of [["mobile", ctxM], ["desktop", ctxD]]) {
      const page = await ctx.newPage(); const errs = [];
      page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
      page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
      page.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(APP)) errs.push(`${r.status()} ${r.url().replace(APP, "")}`); });
      let status = 0;
      try { const r = await page.goto(APP + path, { waitUntil: "networkidle", timeout: 30000 }); status = r.status(); } catch (e) { errs.push("nav: " + e.message); }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth).catch(() => -1);
      const fontOk = await page.evaluate(() => getComputedStyle(document.body).fontFamily).catch(() => "");
      const links = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href"))).catch(() => []);
      for (const h of links) { if (h && h.startsWith("/") && !h.startsWith("//") && !h.startsWith("/api/")) { const clean = h.split("#")[0]; if (!seen.has(clean)) queue.push(clean); } }
      row[name] = { status, overflow, errs: errs.slice(0, 3), font: fontOk.slice(0, 40) };
      await page.close();
    }
    rows.push(row);
    console.log(`${row.mobile.status}/${row.desktop.status}  ovf ${row.mobile.overflow}  ${path}  ${row.mobile.errs.join(" | ")}`);
  }
  fs.writeFileSync(`${OUT}/audit-results.json`, JSON.stringify(rows, null, 2));
  const bad = rows.filter((r) => r.mobile.status !== 200 || r.desktop.status !== 200 || r.mobile.overflow > 0 || r.mobile.errs.length || r.desktop.errs.length);
  console.log(`\n${rows.length} pages crawled, ${bad.length} with problems`);
  await browser.close();
})();
