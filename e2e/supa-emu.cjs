/* Stand-in for Supabase Auth (GoTrue), PostgREST and Storage, in memory.
 * Exercises the app's real network paths without a real project. Mimics the
 * database triggers the app relies on (profile on signup, admin allow-list,
 * message masking flag, connection activation). Not a security boundary. */
const http = require("node:http");
const crypto = require("node:crypto");

const PORT = Number(process.env.EMU_PORT || 4000);
const SECRET = "emu-secret";
const ADMIN_ALLOWLIST = new Set(["afrongelic.events@gmail.com"]);

// ---------- tables ----------
const tables = {};
function table(name) { return (tables[name] ??= []); }
const PK = { profiles: "id", site_media: "slot", favourites: ["user_id", "cleaner_profile_id"], settings: "key", household_profiles: "user_id", service_catalog: "service_key" };
// foreign keys: table -> column -> target table
const FK = {
  cleaner_profiles: { user_id: "profiles" },
  availability_slots: { cleaner_profile_id: "cleaner_profiles" },
  vog_documents: { cleaner_profile_id: "cleaner_profiles" },
  favourites: { user_id: "profiles", cleaner_profile_id: "cleaner_profiles" },
  meeting_requests: { household_id: "profiles", cleaner_profile_id: "cleaner_profiles" },
  conversations: { household_id: "profiles", cleaner_id: "profiles" },
  messages: { conversation_id: "conversations", sender_id: "profiles" },
  connections: { household_id: "profiles", cleaner_id: "profiles" },
  reports: { reporter_id: "profiles" },
  business_profiles: { user_id: "profiles" },
  business_units: { business_id: "business_profiles" },
  jobs: { business_id: "business_profiles" },
  job_responses: { job_id: "jobs", cleaner_profile_id: "cleaner_profiles" },
  emergency_requests: { requester_id: "profiles" },
  household_profiles: { user_id: "profiles" },
  cleaning_slots: { unit_id: "business_units", business_id: "business_profiles" },
  // Phase 1 (migration 0020)
  pricing_rules: { service_key: "service_catalog" },
  fee_events: { business_id: "business_profiles", rule_id: "pricing_rules" },
  work_records: { business_id: "business_profiles", cleaner_profile_id: "cleaner_profiles", household_id: "profiles" },
  cleaner_strikes: { cleaner_profile_id: "cleaner_profiles" },
};
const UNIQUE = {
  cleaner_profiles: [["user_id"]],
  conversations: [["household_id", "cleaner_id"]],
  connections: [["household_id", "cleaner_id"]],
  vog_documents: [["cleaner_profile_id"]],
  business_profiles: [["user_id"]],
  job_responses: [["job_id", "cleaner_profile_id"]],
  availability_slots: [["cleaner_profile_id", "weekday", "block"]],
  fee_events: [["event_type", "reference_table", "reference_id"]],
  work_records: [["reference_table", "reference_id"]],
};
// ---- Phase 1: catalogue seed, pricing lookup, fee events, work records (mirrors migration 0020) ----
function seedCatalog() {
  if (!table("settings").some((r) => r.key === "cover_rules")) table("settings").push({ key: "cover_rules", value: { cancel_window_hours: 4, strike_limit: 2, max_days_ahead: 14 }, updated_at: new Date().toISOString() });
  if (table("service_catalog").length) return;
  [["connect", true, 0], ["cover", true, 1], ["turnover", true, 2], ["oneoff", false, 3], ["contract", false, 4]].forEach(([k, enabled, sort_order]) =>
    table("service_catalog").push({ service_key: k, enabled, business_types: [], sort_order, updated_at: new Date().toISOString() }));
}
seedCatalog();
function activeRule(service, type) {
  const today = new Date().toISOString().slice(0, 10);
  const rules = table("pricing_rules").filter((r) => r.service_key === service && r.active && r.valid_from <= today && (!r.valid_to || r.valid_to >= today) && (r.business_type === type || r.business_type == null));
  rules.sort((a, b) => (a.business_type ? -1 : b.business_type ? 1 : 0));
  return rules[0] ?? null;
}
function recordFeeEvent(businessId, service, eventType, refTable, refId) {
  if (!businessId) return;
  if (table("fee_events").some((e) => e.event_type === eventType && e.reference_table === refTable && e.reference_id === refId)) return;
  const bp = table("business_profiles").find((b) => b.id === businessId);
  const r = activeRule(service, bp?.business_type ?? null);
  const amt = r && ["per_event", "per_booking"].includes(r.model) ? r.amount_cents : 0;
  table("fee_events").push({ id: crypto.randomUUID(), business_id: businessId, service_key: service, event_type: eventType, reference_table: refTable, reference_id: refId, occurred_at: new Date().toISOString(), rule_id: r?.id ?? null, model: r?.model ?? "none", amount_cents: amt, btw_cents: Math.round(amt * 0.21), status: "pending", waived_reason: null, created_at: new Date().toISOString() });
}
function upsertWork(ref, row) {
  const existing = table("work_records").find((w) => w.reference_table === ref.table && w.reference_id === ref.id);
  if (existing) { Object.assign(existing, row, { updated_at: new Date().toISOString() }); return existing; }
  const rec = { id: crypto.randomUUID(), business_id: null, household_id: null, cleaner_profile_id: null, scheduled_start: null, scheduled_end: null, started_at: null, completed_at: null, photo_path: null, business_confirmed_at: null, outcome: "scheduled", notes: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), reference_table: ref.table, reference_id: ref.id, ...row };
  table("work_records").push(rec);
  return rec;
}
function pointOf(v) { const m = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(String(v || "")); return m ? { lng: Number(m[1]), lat: Number(m[2]) } : null; }
function kmBetween(a, b) { const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
function eligible(cp, r) {
  if (!cp || !cp.emergency_opt_in) return false;
  if (r.requester_type !== "household" && (cp.work_scope ?? "household") === "household") return false;
  const a = pointOf(r.location), b = pointOf(cp.location);
  if (a && b && kmBetween(a, b) > (cp.radius_km ?? 10)) return false;
  return true;
}
function coverRules() { return table("settings").find((r) => r.key === "cover_rules")?.value ?? { cancel_window_hours: 4, strike_limit: 2, max_days_ahead: 14 }; }
function slotWorkTrigger(old, next) {
  if (next.status === "reserved" && old.status !== "reserved") upsertWork({ table: "cleaning_slots", id: next.id }, { business_id: next.business_id, cleaner_profile_id: next.reserved_by, service_key: "turnover", scheduled_start: next.starts_at, scheduled_end: next.ends_at, outcome: "scheduled" });
  else if (next.status === "done" && old.status !== "done") { upsertWork({ table: "cleaning_slots", id: next.id }, { business_id: next.business_id, cleaner_profile_id: next.reserved_by, service_key: "turnover", scheduled_start: next.starts_at, scheduled_end: next.ends_at, completed_at: next.done_at ?? new Date().toISOString(), outcome: "done" }); recordFeeEvent(next.business_id, "turnover", "turnover_completed", "cleaning_slots", next.id); }
  else if (next.status === "cancelled" && old.status !== "cancelled") { const w = table("work_records").find((x) => x.reference_table === "cleaning_slots" && x.reference_id === next.id); if (w) w.outcome = "cancelled"; }
}
function emergencyWorkTrigger(old, next) {
  if (next.status === "accepted" && old.status !== "accepted") {
    const bp = table("business_profiles").find((b) => b.user_id === next.requester_id);
    upsertWork({ table: "emergency_requests", id: next.id }, { business_id: bp?.id ?? null, household_id: bp ? null : next.requester_id, cleaner_profile_id: next.accepted_by, service_key: "cover", scheduled_start: next.window_start, scheduled_end: next.window_end, outcome: "scheduled" });
    if (bp) recordFeeEvent(bp.id, "cover", "cover_accepted", "emergency_requests", next.id);
  } else if (["cancelled", "expired"].includes(next.status) && old.status !== next.status) { const w = table("work_records").find((x) => x.reference_table === "emergency_requests" && x.reference_id === next.id); if (w) w.outcome = "cancelled"; }
}
function connectionFeeTrigger(old, next) {
  if (next.status === "active" && old.status !== "active") { const bp = table("business_profiles").find((b) => b.user_id === next.household_id); if (bp) recordFeeEvent(bp.id, "connect", "connection_activated", "connections", next.id); }
}
const users = new Map(); // email -> { id, email, password }
const objects = new Map(); // bucket/path -> Buffer
const log = [];

table("settings").push(
  { key: "rate_floor_cents", value: 1500 }, { key: "household_fee_cents", value: 1495 }, { key: "banned_words", value: [] },
  { key: "business_unit_prices_cents", value: { airbnb: 1500, hotel: 300, restaurant: 4900, office: 4900, school: 9900 } },
  { key: "emergency_fee_cents", value: { household_incl_btw: 995, business_excl_btw: 1495 } },
  { key: "linen_addon", value: { enabled: false, price_per_unit_cents: 400 } }, { key: "vog_max_age_months", value: 12 },
);

// ---------- helpers ----------
function b64url(buf) { return Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function jwt(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600, session_id: crypto.randomUUID() }));
  const sig = b64url(crypto.createHmac("sha256", SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}
function userJson(u) {
  return { id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: "email", providers: ["email"] }, user_metadata: u.meta ?? {}, identities: [{ id: u.id, user_id: u.id, provider: "email", identity_data: { email: u.email } }], created_at: u.created_at, updated_at: new Date().toISOString() };
}
function session(u) { return { access_token: jwt(u), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: crypto.randomUUID(), user: userJson(u) }; }
function userFromAuth(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  if (!m) return null;
  try { const payload = JSON.parse(Buffer.from(m[1].split(".")[1], "base64").toString()); for (const u of users.values()) if (u.id === payload.sub) return u; } catch { /* ignore */ }
  return null;
}
function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const buf = isBuf ? body : Buffer.from(body === "" ? "" : JSON.stringify(body));
  res.writeHead(status, { "content-type": isBuf ? headers["content-type"] || "application/octet-stream" : "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*", ...headers });
  res.end(buf);
}
function readBody(req) { return new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c))); }); }
function roleOf(userId) { return table("profiles").find((p) => p.id === userId)?.role; }

// ---------- PostgREST-ish query engine ----------
function parseValue(v) {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}
function matchFilter(row, col, op, raw) {
  const val = row[col];
  switch (op) {
    case "eq": return String(val) === raw;
    case "neq": return String(val) !== raw;
    case "is": return raw === "null" ? val == null : String(val) === raw;
    case "in": return raw.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(val));
    case "gt": return val > parseValue(raw);
    case "gte": return val >= parseValue(raw);
    case "lt": return val < parseValue(raw);
    case "lte": return val <= parseValue(raw);
    case "not": { const [op2, ...rest] = raw.split("."); return !matchFilter(row, col, op2, rest.join(".")); }
    case "ilike": return String(val ?? "").toLowerCase().includes(raw.replace(/%/g, "").toLowerCase());
    default: return true;
  }
}
function applyFilters(rows, params) {
  let out = rows;
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    if (key === "or") {
      const parts = raw.replace(/^\(|\)$/g, "").split(",");
      out = out.filter((row) => parts.some((p) => { const [col, op, ...rest] = p.split("."); return matchFilter(row, col, op, rest.join(".")); }));
      continue;
    }
    const [op, ...rest] = raw.split(".");
    out = out.filter((row) => matchFilter(row, key, op, rest.join(".")));
  }
  return out;
}
function parseSelect(select) {
  // "a, b, rel ( x, y ), c" -> { cols:[a,b,c], embeds:[{name:rel, select:"x, y"}] }
  const cols = []; const embeds = [];
  let depth = 0, buf = "", name = "";
  for (const ch of select || "*") {
    if (ch === "(") { if (depth === 0) { name = buf.trim(); buf = ""; } else buf += ch; depth++; }
    else if (ch === ")") { depth--; if (depth === 0) { embeds.push({ name, select: buf }); buf = ""; } else buf += ch; }
    else if (ch === "," && depth === 0) { if (buf.trim()) cols.push(buf.trim()); buf = ""; }
    else buf += ch;
  }
  if (buf.trim()) cols.push(buf.trim());
  return { cols, embeds };
}
function project(tname, row, select) {
  const { cols, embeds } = parseSelect(select);
  const out = {};
  const all = cols.length === 0 || cols.includes("*");
  for (const k of Object.keys(row)) if (all || cols.includes(k)) out[k] = row[k];
  for (const e of embeds) {
    const target = e.name.replace(/!.*$/, "");
    const fkToTarget = Object.entries(FK[tname] ?? {}).find(([, t]) => t === target);
    if (fkToTarget) {
      const [col] = fkToTarget;
      const trow = table(target).find((r) => r[PK[target] ?? "id"] === row[col]);
      out[target] = trow ? project(target, trow, e.select) : null;
      continue;
    }
    const fkFromTarget = Object.entries(FK[target] ?? {}).find(([, t]) => t === tname);
    if (fkFromTarget) {
      const [col] = fkFromTarget;
      out[target] = table(target).filter((r) => r[col] === row[PK[tname] ?? "id"]).map((r) => project(target, r, e.select));
      continue;
    }
    out[target] = null;
  }
  return out;
}
function applyOrder(rows, order) {
  if (!order) return rows;
  const [col, dir] = order.split(".");
  return [...rows].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (dir === "desc" ? -1 : 1));
}
function conflictKey(tname, params, row) {
  const oc = params.get("on_conflict");
  const cols = oc ? oc.split(",") : (Array.isArray(PK[tname]) ? PK[tname] : [PK[tname] ?? "id"]);
  return table(tname).find((r) => cols.every((c) => r[c] === row[c]));
}
function uniqueViolation(tname, row, exceptRow) {
  for (const cols of UNIQUE[tname] ?? []) {
    if (table(tname).some((r) => r !== exceptRow && cols.every((c) => r[c] === row[c]))) return cols.join(",");
  }
  return null;
}
// trigger emulation
function beforeInsert(tname, row, user) {
  if (tname === "messages") {
    const conv = table("conversations").find((c) => c.id === row.conversation_id);
    const active = conv && table("connections").some((k) => k.household_id === conv.household_id && k.cleaner_id === conv.cleaner_id && k.status === "active");
    if (!active) row.masked = true;
  }
  if (tname === "profiles" && row.role === "admin" && !ADMIN_ALLOWLIST.has(user?.email)) throw new Error("role escalation blocked");
  // role-bound writes (migration 0019)
  const role = user ? roleOf(user.id) : null;
  if (tname === "cleaner_profiles" && role !== "cleaner" && role !== "admin") throw new Error("new row violates row-level security policy for table \"cleaner_profiles\"");
  if (tname === "business_profiles" && role !== "business" && role !== "admin") throw new Error("only business accounts can create a business profile");
  if ((tname === "meeting_requests" || tname === "favourites" || tname === "conversations") && !["household", "business", "admin"].includes(role)) throw new Error("new row violates row-level security policy");
  if (tname === "household_profiles" && role !== "household") throw new Error("new row violates row-level security policy");
  if (tname === "emergency_requests") {
    if (row.unit_id) { const u = table("business_units").find((x) => x.id === row.unit_id); const bp = u && table("business_profiles").find((b) => b.id === u.business_id); if (!bp || bp.user_id !== row.requester_id) throw new Error("unit does not belong to the requester"); }
    if (new Date(row.window_start) > new Date(Date.now() + (coverRules().max_days_ahead + 1) * 864e5)) throw new Error("too far ahead");
  }
  if (tname === "cleaner_strikes") throw new Error("new row violates row-level security policy for table \"cleaner_strikes\"");
  if ((tname === "fee_events" || tname === "work_records") ) throw new Error("new row violates row-level security policy for table \"" + tname + "\"");
  if ((tname === "pricing_rules" || tname === "service_catalog") && role !== "admin") throw new Error("new row violates row-level security policy for table \"" + tname + "\"");
}
function beforeUpdate(tname, row, patch, user) {
  const role = user ? roleOf(user.id) : null;
  if (["pricing_rules", "service_catalog", "fee_events"].includes(tname) && role !== "admin") throw new Error("permission denied for table " + tname);
  if (tname === "work_records") throw new Error("permission denied for table work_records");
  if (tname === "cleaning_slots") slotWorkTrigger(row, { ...row, ...patch });
  if (tname === "emergency_requests") emergencyWorkTrigger(row, { ...row, ...patch });
  if (tname === "vog_documents" && patch.status && patch.status !== "pending" && row.status === "pending") {
    if (row.storage_path) objects.delete(`vog/${row.storage_path}`);
    patch.storage_path = null; patch.reviewed_at = new Date().toISOString();
  }
  if (tname === "connections") {
    const next = { ...row, ...patch };
    if (next.household_confirmed_at && next.cleaner_confirmed_at && next.status === "pending") {
      patch.status = "active"; patch.started_at = next.started_at ?? new Date().toISOString();
      const cp = table("cleaner_profiles").find((c) => c.user_id === next.cleaner_id);
      if (cp) cp.verified_jobs_count = (cp.verified_jobs_count ?? 0) + 1;
      connectionFeeTrigger(row, { ...next, status: "active" });
    }
  }
  if (tname === "profiles" && patch.role !== undefined && patch.role !== row.role) throw new Error("role cannot be changed after sign-up");
}
const DEFAULTS = {
  cleaner_profiles: () => ({ status: "draft", verified_jobs_count: 0, job_types: ["household"], work_scope: "household", experience_years: null, emergency_opt_in: false, min_hours: 2, radius_km: 10 }),
  meeting_requests: () => ({ status: "requested" }),
  connections: () => ({ status: "pending" }),
  messages: () => ({ masked: true }),
  reports: () => ({ status: "open" }),
  conversations: () => ({ last_message_at: new Date().toISOString() }),
  vog_documents: () => ({ status: "pending" }),
  jobs: () => ({ status: "draft" }),
  business_profiles: () => ({ unit_count: 1 }),
  emergency_requests: () => ({ status: "searching", attendance: "unknown", unit_id: null, report_to: null, cancelled_at: null, cancel_reason: null, accepted_by: null, fee_cents: null }),
  pricing_rules: () => ({ model: "none", amount_cents: 0, percent: null, unit: null, business_type: null, valid_from: new Date().toISOString().slice(0, 10), valid_to: null, active: false, notes: null }),
};

function rest(req, res, url, raw) {
  let tname = url.pathname.slice("/rest/v1/".length).replace(/\/$/, "");
  // RPC: accept_emergency_request (first to accept wins)
  if (tname === "rpc/accept_emergency_request") {
    const user = userFromAuth(req);
    const { p_request_id } = JSON.parse(raw.toString() || "{}");
    const cp = user && table("cleaner_profiles").find((c) => c.user_id === user.id && c.emergency_opt_in);
    const r = table("emergency_requests").find((x) => x.id === p_request_id);
    if (!cp || !r || !eligible(cp, r) || r.status !== "searching" || new Date(r.window_start) <= new Date()) return send(res, 200, false);
    const old = { ...r };
    r.status = "accepted"; r.accepted_by = cp.id; r.accepted_at = new Date().toISOString();
    r.fee_cents = r.requester_type === "household" ? 995 : null;
    emergencyWorkTrigger(old, r);
    return send(res, 200, true);
  }
  // RPC: cancel_emergency_request (requester; late = inside the cancel window → fee event stays)
  if (tname === "rpc/cancel_emergency_request") {
    const user = userFromAuth(req);
    const { p_request_id, p_reason } = JSON.parse(raw.toString() || "{}");
    const r = table("emergency_requests").find((x) => x.id === p_request_id && user && x.requester_id === user.id);
    if (!r || !["searching", "accepted"].includes(r.status)) return send(res, 200, "not_allowed");
    const late = r.status === "accepted" && Date.now() > new Date(r.window_start).getTime() - coverRules().cancel_window_hours * 3600e3;
    const old = { ...r };
    r.status = "cancelled"; r.cancelled_at = new Date().toISOString(); r.cancel_reason = p_reason || null;
    emergencyWorkTrigger(old, r);
    if (!late) for (const e of table("fee_events")) if (e.reference_table === "emergency_requests" && e.reference_id === r.id && e.status === "pending") { e.status = "waived"; e.waived_reason = "cancelled outside the window"; }
    return send(res, 200, late ? "cancelled_late" : "cancelled_free");
  }
  // RPC: report_emergency_attendance (requester; no-show → fee waived + strike; limit → opt-in off)
  if (tname === "rpc/report_emergency_attendance") {
    const user = userFromAuth(req);
    const { p_request_id, p_came, p_note } = JSON.parse(raw.toString() || "{}");
    const r = table("emergency_requests").find((x) => x.id === p_request_id && user && x.requester_id === user.id);
    if (!r || r.status !== "accepted" || !r.accepted_by || Date.now() < new Date(r.window_start).getTime() || r.attendance !== "unknown") return send(res, 200, false);
    r.attendance = p_came ? "came" : "no_show"; r.attendance_at = new Date().toISOString(); r.attendance_note = p_note || null;
    const w = table("work_records").find((x) => x.reference_table === "emergency_requests" && x.reference_id === r.id);
    if (p_came) { if (w) { w.outcome = "done"; w.completed_at = w.completed_at ?? new Date().toISOString(); w.business_confirmed_at = new Date().toISOString(); } }
    else {
      if (w) { w.outcome = "no_show"; w.business_confirmed_at = new Date().toISOString(); if (p_note) w.notes = p_note; }
      for (const e of table("fee_events")) if (e.reference_table === "emergency_requests" && e.reference_id === r.id && e.status === "pending") { e.status = "waived"; e.waived_reason = "no-show"; }
      if (!table("cleaner_strikes").some((k) => k.request_id === r.id)) table("cleaner_strikes").push({ id: crypto.randomUUID(), cleaner_profile_id: r.accepted_by, request_id: r.id, reason: "no_show", created_at: new Date().toISOString() });
      const n = table("cleaner_strikes").filter((k) => k.cleaner_profile_id === r.accepted_by).length;
      if (n >= coverRules().strike_limit) { const cp = table("cleaner_profiles").find((c) => c.id === r.accepted_by); if (cp) cp.emergency_opt_in = false; }
    }
    return send(res, 200, true);
  }
  // RPC: review_work_record (business/household confirms or disputes own record)
  if (tname === "rpc/review_work_record") {
    const user = userFromAuth(req);
    const { p_record_id, p_ok, p_note } = JSON.parse(raw.toString() || "{}");
    const rec = table("work_records").find((w) => w.id === p_record_id);
    if (!rec) return send(res, 200, false);
    const owner = user && (table("business_profiles").some((b) => b.id === rec.business_id && b.user_id === user.id) || rec.household_id === user.id || roleOf(user.id) === "admin");
    if (!owner) return send(res, 400, { code: "P0001", message: "not your work record" });
    if (p_ok) { rec.business_confirmed_at = new Date().toISOString(); if (rec.outcome === "scheduled") rec.outcome = "done"; }
    else { rec.outcome = "disputed"; for (const e of table("fee_events")) if (e.reference_table === rec.reference_table && e.reference_id === rec.reference_id && e.status === "pending") { e.status = "waived"; e.waived_reason = "disputed by customer"; } }
    if (p_note) rec.notes = p_note;
    rec.updated_at = new Date().toISOString();
    return send(res, 200, true);
  }
  // RPC: progress_work_record (cleaner starts / completes own record)
  if (tname === "rpc/progress_work_record") {
    const user = userFromAuth(req);
    const { p_record_id, p_action } = JSON.parse(raw.toString() || "{}");
    const me = user && table("cleaner_profiles").find((c) => c.user_id === user.id);
    const rec = table("work_records").find((w) => w.id === p_record_id && me && w.cleaner_profile_id === me.id);
    if (!rec) return send(res, 200, false);
    if (p_action === "start") rec.started_at = rec.started_at ?? new Date().toISOString();
    else if (p_action === "complete") { rec.completed_at = rec.completed_at ?? new Date().toISOString(); if (rec.outcome === "scheduled") rec.outcome = "done"; }
    else return send(res, 200, false);
    rec.updated_at = new Date().toISOString();
    return send(res, 200, true);
  }
  if (tname.startsWith("rpc/")) return send(res, 404, { message: `unknown rpc ${tname}` });
  // view: open emergency requests without the street address
  let viewRows = null;
  if (tname === "emergency_requests_open") {
    tname = "emergency_requests";
    const me = userFromAuth(req); const cpMe = me && table("cleaner_profiles").find((c) => c.user_id === me.id);
    viewRows = table("emergency_requests").filter((r) => r.status === "searching" && new Date(r.window_start) > new Date() && eligible(cpMe, r)).map(({ address_line: _a, location: _l, ...rest }) => ({ ...rest, postcode: String(rest.postcode).slice(0, 4) }));
  }
  const params = url.searchParams;
  const prefer = req.headers.prefer || "";
  const single = /vnd\.pgrst\.object/.test(req.headers.accept || "");
  const wantsRepresentation = /return=representation/.test(prefer);
  const wantsCount = /count=exact/.test(prefer);
  const user = userFromAuth(req);
  const select = params.get("select") || "*";
  const respond = (rows, status = 200, extra = {}) => {
    const projected = rows.map((r) => project(tname, r, select));
    if (single) return projected[0] ? send(res, status, projected[0], extra) : send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "0 rows" });
    return send(res, status, projected, extra);
  };
  try {
    if (req.method === "GET" || req.method === "HEAD") {
      let rows = applyFilters(viewRows ?? table(tname), params);
      rows = applyOrder(rows, params.get("order"));
      const total = rows.length;
      const limit = Number(params.get("limit") || 0);
      if (limit) rows = rows.slice(0, limit);
      const headers = wantsCount ? { "content-range": `0-${Math.max(rows.length - 1, 0)}/${total}` } : {};
      if (req.method === "HEAD") { res.writeHead(200, { ...headers, "access-control-allow-origin": "*", "access-control-expose-headers": "*" }); return res.end(); }
      return respond(rows, 200, headers);
    }
    let body = {};
    try { body = JSON.parse(raw.toString() || "{}"); } catch { body = {}; }
    if (req.method === "POST") {
      const list = Array.isArray(body) ? body : [body];
      const out = [];
      for (const item of list) {
        const existing = /resolution=merge-duplicates/.test(prefer) ? conflictKey(tname, params, item) : null;
        if (existing) {
          if (/ignore/.test(prefer)) { out.push(existing); continue; }
          beforeUpdate(tname, existing, item, user);
          Object.assign(existing, item);
          out.push(existing);
          continue;
        }
        const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...(DEFAULTS[tname]?.() ?? {}), ...item };
        if (PK[tname] && PK[tname] !== "id") delete row.id;
        if (tname === "profiles") row.id = item.id;
        beforeInsert(tname, row, user);
        const viol = uniqueViolation(tname, row);
        if (viol) return send(res, 409, { code: "23505", message: `duplicate key value violates unique constraint (${viol})` });
        table(tname).push(row);
        out.push(row);
      }
      return wantsRepresentation ? respond(out, 201) : send(res, 201, "");
    }
    if (req.method === "PATCH") {
      const rows = applyFilters(table(tname), params);
      for (const r of rows) { beforeUpdate(tname, r, body, user); Object.assign(r, body); }
      return wantsRepresentation ? respond(rows) : send(res, 204, "");
    }
    if (req.method === "DELETE") {
      const rows = applyFilters(table(tname), params);
      tables[tname] = table(tname).filter((r) => !rows.includes(r));
      return wantsRepresentation ? respond(rows) : send(res, 204, "");
    }
  } catch (e) {
    return send(res, 400, { code: "P0001", message: e.message });
  }
  return send(res, 405, { message: "method" });
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  log.push(`${req.method} ${p}${url.search}`);
  if (req.method === "OPTIONS") return send(res, 204, "");
  const raw = await readBody(req);
  const json = () => { try { return JSON.parse(raw.toString() || "{}"); } catch { return {}; } };

  // ---- Auth ----
  if (p === "/auth/v1/signup" && req.method === "POST") {
    const { email, password, data } = json();
    const key = String(email || "").toLowerCase();
    if (!key || !password) return send(res, 400, { code: 400, error_code: "validation_failed", msg: "Signup requires a valid password" });
    if (password.length < 8) return send(res, 422, { code: 422, error_code: "weak_password", msg: "Password should be at least 8 characters." });
    if (users.has(key)) return send(res, 422, { code: 422, error_code: "user_already_exists", msg: "User already registered" });
    const u = { id: crypto.randomUUID(), email: key, password, meta: data ?? {}, created_at: new Date().toISOString() };
    users.set(key, u);
    const role = ADMIN_ALLOWLIST.has(key) ? "admin" : ["household", "cleaner", "business"].includes(data?.role) ? data.role : "household";
    table("profiles").push({ id: u.id, role, display_name: (data?.display_name || key.split("@")[0]), city: null, locale: "nl", created_at: u.created_at });
    return send(res, 200, session(u));
  }
  if (p === "/auth/v1/token" && req.method === "POST") {
    const { email, password, refresh_token } = json();
    if (url.searchParams.get("grant_type") === "refresh_token") {
      const u = [...users.values()][0];
      return u ? send(res, 200, session(u)) : send(res, 400, { error: "invalid_grant" });
    }
    const u = users.get(String(email || "").toLowerCase());
    if (!u || u.password !== password) return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    void refresh_token;
    return send(res, 200, session(u));
  }
  if (p === "/auth/v1/user" && req.method === "GET") {
    const u = userFromAuth(req);
    if (!u) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    return send(res, 200, userJson(u));
  }
  if (p === "/auth/v1/logout") return send(res, 204, "");

  // ---- PostgREST ----
  if (p.startsWith("/rest/v1/")) return rest(req, res, url, raw);

  // ---- Storage ----
  if (p.startsWith("/storage/v1/object/public/") && req.method === "GET") {
    const key = p.slice("/storage/v1/object/public/".length);
    const obj = objects.get(key);
    return obj ? send(res, 200, obj, { "content-type": "image/webp", "cache-control": "public, max-age=60" }) : send(res, 404, { error: "not found" });
  }
  if (p.startsWith("/storage/v1/object/sign/") && req.method === "POST") {
    const u = userFromAuth(req);
    const key = p.slice("/storage/v1/object/sign/".length);
    if (!u || roleOf(u.id) !== "admin" || !objects.has(key)) return send(res, 400, { error: "not found" });
    return send(res, 200, { signedURL: `/object/sign/${key}?token=emu` });
  }
  if (p.startsWith("/storage/v1/object/") && req.method === "POST") {
    const u = userFromAuth(req);
    const key = p.slice("/storage/v1/object/".length);
    const [bucket, owner] = key.split("/");
    const allowed = u && (bucket === "site-media" ? roleOf(u.id) === "admin" : owner === u.id);
    if (!allowed) return send(res, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
    objects.set(key, raw);
    return send(res, 200, { Key: key, Id: crypto.randomUUID() });
  }
  if (p.startsWith("/storage/v1/object/") && req.method === "DELETE") {
    const bucket = p.slice("/storage/v1/object/".length);
    for (const k of json().prefixes || []) objects.delete(`${bucket}/${k}`);
    return send(res, 200, []);
  }

  // ---- introspection for the test ----
  if (p === "/__emu/state") return send(res, 200, { users: [...users.values()].map((u) => ({ email: u.email, role: roleOf(u.id) })), tables: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])), objects: [...objects.keys()], log: log.slice(-40) });
  if (p === "/__emu/table") return send(res, 200, table(url.searchParams.get("name") || ""));
  if (p === "/__emu/reset") { users.clear(); objects.clear(); log.length = 0; for (const k of Object.keys(tables)) if (k !== "settings") delete tables[k]; seedCatalog(); return send(res, 200, { ok: true }); }
  return send(res, 404, { error: `unhandled ${req.method} ${p}` });
});
server.listen(PORT, () => console.log(`supa-emu on ${PORT}`));
