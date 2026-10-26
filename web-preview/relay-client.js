"use strict";
// An outbox is a temporary browser copy, not a database or a backup guarantee.
// No participant data is logged. Only a confirmed receipt removes an entry.
globalThis.IAT_RELAY = (() => {
  const prefix = "iat.pending.v1.";
  const memory = new Map();
  const flights = new Map();
  let durable = true;
  function storage() { return globalThis.localStorage; }
  function list() {
    const entries = new Map(memory);
    try {
      const store = storage();
      if (store) for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key?.startsWith(prefix)) {
          try { const body = store.getItem(key); const p = JSON.parse(body);
            if (key === prefix + p.participant_id) entries.set(key, body);
          } catch { /* Retain malformed local entries; never send blindly. */ }
        }
      }
    } catch { durable = false; }
    return [...entries.values()].map(body => JSON.parse(body));
  }
  function stage(payload) {
    const key = prefix + payload.participant_id;
    let previous = memory.get(key);
    try { previous ||= storage()?.getItem(key); } catch { durable = false; }
    // Keep the exact first snapshot, including after a lost response.
    const body = previous || JSON.stringify(payload);
    memory.set(key, body);
    try {
      const store = storage();
      if (!store) throw new Error("storage_unavailable");
      store.setItem(key, body);
    } catch { durable = false; }
    return JSON.parse(body);
  }
  function send(endpoint, payload) {
    const pending = stage(payload);
    const key = prefix + pending.participant_id;
    if (flights.has(key)) return flights.get(key);
    const operation = (async () => {
      const url = new URL(endpoint);
      if (url.protocol !== "https:" || url.pathname !== "/results" || url.search || url.hash || url.username || url.password) throw new Error("invalid_relay_url");
      const response = await fetch(url.href, {
        method: "POST", credentials: "omit", redirect: "error",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(pending), signal: AbortSignal.timeout(25000)
      });
      if (response.status !== 200) throw new Error("relay_rejected");
      const receipt = await response.json();
      if (receipt.saved !== true || receipt.participant_id !== pending.participant_id) throw new Error("invalid_receipt");
      memory.delete(key);
      try { storage()?.removeItem(key); } catch { /* Safe to retry if retained. */ }
    })();
    flights.set(key, operation);
    operation.finally(() => flights.delete(key)).catch(() => {});
    return operation;
  }
  return {list, send, get durable() {return durable;}};
})();
