import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {webcrypto} from "node:crypto";
import {createHandler, validPayload} from "./worker.mjs";

const origin = "https://fatemeh1378-24.github.io";
const endpoint = "https://example.workers.dev/results";
const env = {SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only"};
const source = fs.readFileSync(new URL("../web-preview/app.js", import.meta.url), "utf8");
const definitions = source.slice(0, source.indexOf('document.addEventListener("keydown"'));
const scoreSource = fs.readFileSync(new URL("../web-preview/mfq-scoring.js", import.meta.url), "utf8");
const sandbox = {document: {querySelectorAll: () => []}, crypto: webcrypto, URLSearchParams, location: {search: ""}};
vm.createContext(sandbox);
vm.runInContext(scoreSource + "\n" + definitions + `
state.sdoResponses = Object.fromEntries(Array.from({length:16}, (_, i) => ['sdo_' + String(i+1).padStart(2,'0'), 3]));
state.sdoScore = 3;
state.mfqResponses = Object.fromEntries(Array.from({length:36}, (_, i) => ['mfq_' + String(i+1).padStart(2,'0'), 2]));
state.mfqDomainScores = MFQ_SCORING.calculate(state.mfqResponses);
this.payload = participantInsertPayload({Participant_ID: SESSION_PARTICIPANT_ID, Group: 1,
Age: 25, Gender: 'زن', Education_Level: 'کارشناسی', Employment_Status: 'شاغل',
Monthly_Income: 'متوسط', Religiosity: 'متوسط', ...calculateScores([])});
`, sandbox);
const payload = JSON.parse(JSON.stringify(sandbox.payload));
const request = (p = payload, options = {}) => new Request(endpoint, {
  method: "POST", headers: {Origin: origin, "Content-Type": "application/json"}, body: JSON.stringify(p), ...options
});

test("current app payload is accepted and forwarded without altering any fields", async () => {
  assert.equal(validPayload(payload), true);
  const handle = createHandler(async (url, opts) => {
    assert.equal(url, "https://iiogctpamxbomtjdzred.supabase.co/rest/v1/participants?on_conflict=participant_id");
    assert.deepEqual(JSON.parse(opts.body), payload);
    assert.equal(opts.headers.Prefer, "resolution=ignore-duplicates,return=minimal");
    assert.equal(opts.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
    assert.equal(opts.headers.Authorization, undefined);
    return new Response(null, {status: 201});
  });
  const response = await handle(request(), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {saved: true, participant_id: payload.participant_id});
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
});

test("unavailable, rejected or unexpected database responses never acknowledge a save", async () => {
  for (const status of [200, 400, 401, 403, 409, 500, 503]) {
    const response = await createHandler(async () => new Response("private detail", {status}))(request(), env);
    assert.equal(response.status, 502);
    assert.equal((await response.text()).includes("private detail"), false);
  }
  const response = await createHandler(async () => {throw new Error("timeout");})(request(), env);
  assert.equal(response.status, 503);
});

test("fixed route, exact origin, limited payload and least privilege fail closed", async () => {
  let calls = 0;
  const handle = createHandler(async () => {calls++; return new Response(null, {status: 201});});
  assert.equal((await handle(request(), {})).status, 503);
  assert.equal((await handle(request(), {SUPABASE_PUBLISHABLE_KEY: "sb_secret_bad"})).status, 503);
  assert.equal((await handle(request(payload, {headers: {Origin: "https://attacker.example", "Content-Type": "application/json"}}), env)).status, 403);
  assert.equal((await handle(new Request(endpoint, {method: "GET", headers: {Origin: origin}}), env)).status, 405);
  assert.equal((await handle(request({...payload, admin: true}), env)).status, 400);
  assert.equal((await handle(request({...payload, mfq_responses: {}}), env)).status, 400);
  assert.equal((await handle(request({...payload, age: 19}), env)).status, 400);
  assert.equal((await handle(request(payload, {body: "x".repeat(65537)}), env)).status, 413);
  const health = await handle(new Request("https://example.workers.dev/health"), {});
  assert.equal(health.status, 200);
  assert.equal(calls, 0);
});

test("preflight and optional IP limiter do not write to database", async () => {
  const handle = createHandler(() => {throw new Error("unexpected upstream call");});
  const preflight = await handle(new Request(endpoint, {method: "OPTIONS", headers: {Origin: origin}}), {});
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Headers"), "Content-Type");
  assert.equal((await handle(request(), {...env, RESULTS_RATE_LIMITER: {limit: async () => ({success: false})}})).status, 429);
});

const clientSource = fs.readFileSync(new URL("../web-preview/relay-client.js", import.meta.url), "utf8");
function browser(store, fetcher) {
  const c = {localStorage: store, fetch: fetcher, URL, AbortSignal};
  vm.createContext(c); vm.runInContext(clientSource, c);
  return c.IAT_RELAY;
}
function localStore() {
  const map = new Map();
  return {get length() {return map.size;}, key: i => [...map.keys()][i],
    getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k)};
}

test("lost acknowledgement survives reload; retry keeps exact first payload and is not an update", async () => {
  const store = localStore();
  const rows = new Map();
  let attempts = 0;
  const handle = createHandler(async (_url, opts) => {
    const p = JSON.parse(opts.body);
    if (!rows.has(p.participant_id)) rows.set(p.participant_id, p);
    return new Response(null, {status: 201});
  });
  const fetcher = async (_url, opts) => {
    const response = await handle(request(JSON.parse(opts.body)), env);
    if (++attempts === 1) throw new Error("reply lost after database committed");
    return response;
  };
  const first = browser(store, fetcher);
  await assert.rejects(first.send(endpoint, payload));
  assert.equal(store.length, 1);
  assert.equal(rows.size, 1);
  const reloaded = browser(store, fetcher);
  assert.equal(reloaded.list().length, 1);
  await reloaded.send(endpoint, {...payload, age: 30});
  assert.equal(rows.size, 1);
  assert.deepEqual(rows.get(payload.participant_id), payload);
  assert.equal(store.length, 0);
  assert.equal(reloaded.list().length, 0);
});

test("a wrong receipt or failed request retains data; storage failure still allows sending", async () => {
  const store = localStore();
  const badReceipt = browser(store, async () => Response.json({saved: true, participant_id: "wrong"}));
  await assert.rejects(badReceipt.send(endpoint, payload));
  assert.equal(store.length, 1);
  const blockedStore = {setItem() {throw new Error("quota");}, getItem() {throw new Error("blocked");}};
  const failed = browser(blockedStore, async () => {throw new Error("offline");});
  await assert.rejects(failed.send(endpoint, payload));
  assert.equal(failed.durable, false);
  assert.equal(failed.list().length, 1);
  const works = browser(blockedStore, async () => Response.json({saved: true, participant_id: payload.participant_id}));
  await works.send(endpoint, payload);
  assert.equal(works.list().length, 0);
});

test("parallel retry clicks share one in-flight submission", async () => {
  let calls = 0;
  let release;
  const wait = new Promise(resolve => {release = resolve;});
  const relay = browser(localStore(), async () => {
    calls++; await wait; return Response.json({saved: true, participant_id: payload.participant_id});
  });
  const one = relay.send(endpoint, payload);
  const two = relay.send(endpoint, payload);
  assert.equal(one, two);
  release(); await Promise.all([one, two]);
  assert.equal(calls, 1);
});

test("actual app restores unsent results and shows thanks only after a matching database receipt", async () => {
  const html = fs.readFileSync(new URL("../web-preview/index.html", import.meta.url), "utf8");
  const nodes = [...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => ({
    id, hidden: false, textContent: "", addEventListener() {}
  }));
  const store = localStore();
  store.setItem("iat.pending.v1." + payload.participant_id, JSON.stringify(payload));
  let successful = false;
  let networkCalls = 0;
  const c = {localStorage: store, URL, URLSearchParams, AbortSignal, crypto: webcrypto,
    location: {search: ""}, console: {error() {}}, window: {addEventListener() {}},
    IAT_RELAY_URL: endpoint, document: {querySelectorAll: () => nodes, addEventListener() {}},
    fetch: async () => { networkCalls++; return successful
      ? Response.json({saved: true, participant_id: payload.participant_id})
      : Response.json({error: "database_unreachable"}, {status: 503}); }
  };
  vm.createContext(c);
  for (const filename of ["sdo-data.js", "sdo-scoring.js", "questionnaire-data.js", "mfq-scoring.js", "relay-client.js", "app.js"]) {
    vm.runInContext(fs.readFileSync(new URL("../web-preview/" + filename, import.meta.url), "utf8"), c);
  }
  const node = id => nodes.find(n => n.id === id);
  assert.equal(node("intro").hidden, true);
  assert.equal(node("summary").hidden, false);
  assert.equal(node("completion-message").hidden, true);
  await vm.runInContext("submitResults()", c);
  assert.equal(node("completion-message").hidden, true);
  assert.equal(node("retry-save-button").hidden, false);
  assert.equal(store.length, 1);
  successful = true;
  await vm.runInContext("submitResults()", c);
  assert.equal(node("completion-message").hidden, false);
  assert.equal(node("save-result").hidden, true);
  assert.equal(store.length, 0);
  assert.equal(networkCalls, 2);
});
