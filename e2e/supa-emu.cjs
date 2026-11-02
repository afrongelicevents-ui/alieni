/* Minimal stand-in for Supabase Auth (GoTrue), PostgREST and Storage.
 * Exercises the app's real network paths: sign up, log in, get user,
 * profiles.role lookup, site_media table, site-media bucket. */
const http = require("node:http");
const crypto = require("node:crypto");

const PORT = Number(process.env.EMU_PORT || 4000);
const SECRET = "emu-secret";
const users = new Map(); // email -> { id, email, password, confirmed }
const profiles = new Map(); // id -> { role }
const siteMedia = new Map(); // slot -> row
const objects = new Map(); // bucket/path -> Buffer
const ADMIN_ALLOWLIST = new Set(["afrongelic.events@gmail.com"]);
const log = [];

function b64url(buf) { return Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function jwt(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600, session_id: crypto.randomUUID() }));
  const sig = b64url(crypto.createHmac("sha256", SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}
function userJson(u) {
  return { id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [{ id: u.id, user_id: u.id, provider: "email", identity_data: { email: u.email } }], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}
function session(u) { return { access_token: jwt(u), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: crypto.randomUUID(), user: userJson(u) }; }
function userFromAuth(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  if (!m) return null;
  try { const payload = JSON.parse(Buffer.from(m[1].split(".")[1], "base64").toString()); for (const u of users.values()) if (u.id === payload.sub) return u; } catch {}
  return null;
}
function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "content-type": Buffer.isBuffer(body) ? headers["content-type"] || "application/octet-stream" : "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*", ...headers });
  res.end(buf);
}
function readBody(req) { return new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c))); }); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  log.push(`${req.method} ${p}${url.search}`);
  if (req.method === "OPTIONS") return send(res, 204, "");
  const raw = await readBody(req);
  const json = () => { try { return JSON.parse(raw.toString() || "{}"); } catch { return {}; } };

  // ---- Auth ----
  if (p === "/auth/v1/signup" && req.method === "POST") {
    const { email, password } = json();
    const key = String(email || "").toLowerCase();
    if (!key || !password) return send(res, 400, { code: 400, error_code: "validation_failed", msg: "Signup requires a valid password" });
    if (password.length < 8) return send(res, 422, { code: 422, error_code: "weak_password", msg: "Password should be at least 8 characters." });
    if (users.has(key)) return send(res, 422, { code: 422, error_code: "user_already_exists", msg: "User already registered" });
    const u = { id: crypto.randomUUID(), email: key, password, confirmed: true };
    users.set(key, u);
    profiles.set(u.id, { role: ADMIN_ALLOWLIST.has(key) ? "admin" : "household" }); // mirrors handle_new_user trigger
    return send(res, 200, session(u)); // autoconfirm on => session returned
  }
  if (p === "/auth/v1/token" && req.method === "POST") {
    const { email, password } = json();
    const u = users.get(String(email || "").toLowerCase());
    if (!u || u.password !== password) return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    return send(res, 200, session(u));
  }
  if (p === "/auth/v1/user" && req.method === "GET") {
    const u = userFromAuth(req);
    if (!u) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    return send(res, 200, userJson(u));
  }
  if (p === "/auth/v1/logout") return send(res, 204, "");

  // ---- PostgREST ----
  if (p.startsWith("/rest/v1/")) {
    const table = p.slice("/rest/v1/".length);
    const single = /vnd\.pgrst\.object/.test(req.headers.accept || "");
    const u = userFromAuth(req);
    if (table === "profiles") {
      const id = (url.searchParams.get("id") || "").replace("eq.", "");
      const row = profiles.get(id);
      if (single) return row ? send(res, 200, row) : send(res, 406, { code: "PGRST116", message: "0 rows" });
      return send(res, 200, row ? [row] : []);
    }
    if (table === "site_media") {
      if (req.method === "GET") {
        const slot = (url.searchParams.get("slot") || "").replace("eq.", "");
        const rows = slot ? [siteMedia.get(slot)].filter(Boolean) : [...siteMedia.values()];
        if (single) return rows[0] ? send(res, 200, rows[0]) : send(res, 406, { code: "PGRST116", message: "0 rows" });
        return send(res, 200, rows);
      }
      if (!u || profiles.get(u.id)?.role !== "admin") return send(res, 401, { code: "42501", message: "new row violates row-level security policy" });
      if (req.method === "POST") { const row = json(); siteMedia.set(row.slot, row); return send(res, 201, [row]); }
      if (req.method === "DELETE") { const slot = (url.searchParams.get("slot") || "").replace("eq.", ""); siteMedia.delete(slot); return send(res, 200, []); }
    }
    return send(res, 200, single ? {} : []);
  }

  // ---- Storage ----
  if (p.startsWith("/storage/v1/object/public/") && req.method === "GET") {
    const key = p.slice("/storage/v1/object/public/".length);
    const obj = objects.get(key);
    return obj ? send(res, 200, obj, { "content-type": "image/webp", "cache-control": "public, max-age=60" }) : send(res, 404, { error: "not found" });
  }
  if (p.startsWith("/storage/v1/object/") && req.method === "POST") {
    const u = userFromAuth(req);
    if (!u || profiles.get(u.id)?.role !== "admin") return send(res, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
    const key = p.slice("/storage/v1/object/".length);
    objects.set(key, raw);
    return send(res, 200, { Key: key, Id: crypto.randomUUID() });
  }
  if (p.startsWith("/storage/v1/object/") && req.method === "DELETE") {
    const bucket = p.slice("/storage/v1/object/".length);
    for (const k of json().prefixes || []) objects.delete(`${bucket}/${k}`);
    return send(res, 200, []);
  }

  // ---- introspection for the test ----
  if (p === "/__emu/state") return send(res, 200, { users: [...users.values()].map((u) => ({ email: u.email, role: profiles.get(u.id)?.role })), siteMedia: [...siteMedia.values()], objects: [...objects.keys()], log: log.slice(-40) });
  if (p === "/__emu/reset") { users.clear(); profiles.clear(); siteMedia.clear(); objects.clear(); log.length = 0; return send(res, 200, { ok: true }); }
  return send(res, 404, { error: `unhandled ${req.method} ${p}` });
});
server.listen(PORT, () => console.log(`supa-emu on ${PORT}`));
