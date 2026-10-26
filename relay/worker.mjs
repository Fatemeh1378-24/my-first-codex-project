// Cloudflare Worker: accepts only this study's insert payload. No read API.
const PROJECT = "https://iiogctpamxbomtjdzred.supabase.co";
const ORIGIN = "https://fatemeh1378-24.github.io";
const LIMIT = 65536;
const numeric = [
  ...Array.from({length: 7}, (_, i) => `block_${i + 1}_mean_rt`),
  "d_score", "d_short", "d_long", "percent_correct", "prop_rt_300",
  "mean_rt_iranian_female", "mean_rt_iranian_male", "mean_rt_afghan_female",
  "mean_rt_afghan_male", "mean_rt_female_faces", "mean_rt_male_faces",
  "gender_rt_difference", "same_gender_advantage", "sdo_score"
];
const textFields = ["gender", "education_level", "employment_status", "monthly_income", "religiosity"];
const fields = ["participant_id", "group_number", "age", ...textFields, ...numeric,
  "exclude_criteria_met", "sdo_responses", "mfq_responses", "mfq_domain_scores"];

export function validPayload(p) {
  if (!p || Array.isArray(p) || typeof p !== "object") return false;
  if (Object.keys(p).length !== fields.length || !fields.every(k => Object.hasOwn(p, k))) return false;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.participant_id)) return false;
  if (![1, 2].includes(p.group_number) || !Number.isInteger(p.age) || p.age < 20 || p.age > 40) return false;
  if (!textFields.every(k => typeof p[k] === "string" && p[k].length > 0 && p[k].length <= 300)) return false;
  // JSON.stringify maps uncomputable IAT scores (NaN) to null. Preserve that.
  if (!numeric.every(k => p[k] === null || typeof p[k] === "number" && Number.isFinite(p[k]))) return false;
  if (typeof p.exclude_criteria_met !== "boolean") return false;
  const answers = (value, prefix, n, min, max) => value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === n && Array.from({length: n}, (_, i) => `${prefix}_${String(i + 1).padStart(2, "0")}`)
      .every(k => Number.isInteger(value[k]) && value[k] >= min && value[k] <= max);
  if (!answers(p.sdo_responses, "sdo", 16, 1, 5) || !answers(p.mfq_responses, "mfq", 36, 0, 4)) return false;
  const domains = p.mfq_domain_scores;
  return domains && typeof domains === "object" && !Array.isArray(domains)
    && Object.keys(domains).length === 6
    && ["care", "equality", "proportionality", "loyalty", "authority", "purity"].every(k => Object.hasOwn(domains, k))
    && Object.values(domains).every(v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 4);
}

async function readBody(request) {
  if (!request.body) throw new Error("invalid_body");
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > LIMIT) { await reader.cancel(); throw new Error("too_large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes));
}

export function createHandler(upstreamFetch = fetch) {
  return async function handle(request, env = {}) {
    const url = new URL(request.url);
    const allowed = env.ALLOWED_ORIGIN || ORIGIN;
    const origin = request.headers.get("Origin");
    const headers = {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff", "Vary": "Origin"};
    if (origin === allowed) headers["Access-Control-Allow-Origin"] = allowed;
    const reply = (status, body) => new Response(JSON.stringify(body), {status, headers});
    // Reachability only. Does not contact the database or claim data is saved.
    if (url.pathname === "/health" && request.method === "GET") return reply(200, {ok: true, service: "iat-relay"});
    if (url.pathname !== "/results" || url.search) return reply(404, {error: "not_found"});
    if (origin !== allowed) return reply(403, {error: "origin_not_allowed"});
    if (request.method === "OPTIONS") {
      headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
      headers["Access-Control-Allow-Headers"] = "Content-Type";
      return new Response(null, {status: 204, headers});
    }
    if (request.method !== "POST") return reply(405, {error: "method_not_allowed"});
    if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") return reply(415, {error: "json_required"});
    // Publishable key only: all existing anon INSERT grants and RLS still apply.
    // Never use a service-role/secret key to bypass the study's RLS policies.
    if (!env.SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_")) return reply(503, {error: "relay_not_configured"});
    let payload;
    try { payload = await readBody(request); }
    catch (error) { return reply(error.message === "too_large" ? 413 : 400, {error: "invalid_body"}); }
    if (!validPayload(payload)) return reply(400, {error: "invalid_results"});
    if (env.RESULTS_RATE_LIMITER) {
      const {success} = await env.RESULTS_RATE_LIMITER.limit({key: request.headers.get("CF-Connecting-IP") || "unknown"});
      if (!success) return reply(429, {error: "try_later"});
    }
    try {
      const response = await upstreamFetch(`${PROJECT}/rest/v1/participants?on_conflict=participant_id`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
        headers: {apikey: env.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json",
          Prefer: "resolution=ignore-duplicates,return=minimal"},
        body: JSON.stringify(payload)
      });
      // A unique participant_id index is required (see SQL). First submission
      // wins; retries never update earlier results or request SELECT permission.
      if (![201, 204].includes(response.status)) {
        console.error("IAT database insert rejected", response.status);
        return reply(502, {error: "database_rejected"});
      }
      return reply(200, {saved: true, participant_id: payload.participant_id});
    } catch {
      // Includes an ambiguous timeout after a commit. Keep the browser outbox;
      // retrying with the same UUID safely resolves it via the unique index.
      return reply(503, {error: "database_unreachable"});
    }
  };
}

export default {fetch: createHandler()};
