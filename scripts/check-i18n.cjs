/* Static check of translations: every literal t("key") call must exist in messages/nl.json AND messages/en.json,
 * both files must have the same keys. Dynamic keys (template strings) are listed as a count only.
 * Usage: node scripts/check-i18n.cjs */
const fs = require("node:fs");
const path = require("node:path");
const nl = JSON.parse(fs.readFileSync("messages/nl.json", "utf8"));
const en = JSON.parse(fs.readFileSync("messages/en.json", "utf8"));
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const nlKeys = new Set(flat(nl)); const enKeys = new Set(flat(en));
const problems = [];
for (const k of nlKeys) if (!enKeys.has(k)) problems.push(`only in nl: ${k}`);
for (const k of enKeys) if (!nlKeys.has(k)) problems.push(`only in en: ${k}`);
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(tsx?|jsx?)$/.test(e.name) ? [path.join(dir, e.name)] : [])); }
let dynamic = 0, checked = 0;
for (const file of walk("src")) {
  if (file.includes("__tests__") || file.includes("business/[type]/page.tsx")) continue; // that page has its own inline nl/en helper
  const src = fs.readFileSync(file, "utf8");
  const bindings = new Map(); // variable -> namespace
  for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:"([^"]*)")?\s*\)/g)) bindings.set(m[1], m[2] ?? "");
  for (const [v, ns] of bindings) {
    const re = new RegExp(`(?<![\\w.])${v}\\(\\s*(["'\`])((?:\\\\.|(?!\\1).)*)\\1`, "g");
    for (const m of src.matchAll(re)) {
      if (m[1] === "`" && m[2].includes("${")) { dynamic++; continue; }
      const key = ns ? `${ns}.${m[2]}` : m[2];
      checked++;
      if (!nlKeys.has(key) || !enKeys.has(key)) problems.push(`${file}: ${key} ${!nlKeys.has(key) ? "(missing in nl) " : ""}${!enKeys.has(key) ? "(missing in en)" : ""}`);
    }
  }
}
console.log(`${checked} literal keys checked, ${dynamic} dynamic keys skipped, ${nlKeys.size} keys per language`);
if (problems.length) { console.log(problems.join("\n")); process.exit(1); }
console.log("translations OK");
