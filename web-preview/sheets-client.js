"use strict";
globalThis.IAT_SHEETS = (() => {
  const endpoint = "https://script.google.com/macros/s/AKfycbwv4A2k_djoIfTnPmQjTbhUPQ3QJuWbtDuhPbVcpY9RpW_r-Btf0cjGw9skAeVs4ePv/exec";
  const prefix = "iat.sheets.pending.v1.";
  const memory = new Map();
  const flights = new Map();
  let durable = true;
  function canonical(value) {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object") return "{" + Object.keys(value).sort()
      .map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
    return JSON.stringify(value);
  }
  async function digest(body) {
    const bytes = new TextEncoder().encode(body);
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map(b => b.toString(16).padStart(2,"0")).join("");
  }
  function pending() {
    const entries = new Map(memory);
    try {
      const store = globalThis.localStorage;
      if (store) for (let i=0;i<store.length;i++) {
        const key=store.key(i);
        if (key?.startsWith(prefix+"results.")) entries.set(key,store.getItem(key));
      }
    } catch {durable=false;}
    return [...entries].filter(([key])=>key.startsWith(prefix+"results.")).flatMap(([key,body])=>{
      try {const p=JSON.parse(body);return key===prefix+"results."+p.participant_id ? [p] : [];}
      catch {return [];}
    });
  }
  function stage(payload,kind) {
    const key=prefix+kind+"."+payload.participant_id;
    let body=memory.get(key);
    try {body ||= globalThis.localStorage?.getItem(key);} catch {durable=false;}
    // Normalize the same way the original JSON POST normalizes NaN to null.
    body ||= canonical(JSON.parse(JSON.stringify(payload)));
    memory.set(key,body);
    try {
      const store=globalThis.localStorage;
      if (!store) throw new Error("no_storage");
      store.setItem(key,body);
    } catch {durable=false;}
    return {key,body};
  }
  function send(payload,kind="results") {
    if (!["results","probe"].includes(kind)) return Promise.reject(new Error("invalid_kind"));
    const {key,body}=stage(payload,kind);
    if (flights.has(key)) return flights.get(key);
    const flight=(async()=>{
      const p=JSON.parse(body);
      const hash=await digest(body);
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),45000);
      try {
        const response=await fetch(endpoint,{
          method:"POST",mode:"cors",credentials:"omit",redirect:"follow",
          body:new URLSearchParams({data:JSON.stringify({schema_version:1,kind,payload:p})}),
          signal:controller.signal
        });
        if (!response.ok) throw new Error("storage_http_error");
        const receipt=await response.json();
        if (receipt.saved!==true || receipt.participant_id!==p.participant_id || receipt.payload_sha256!==hash) {
          throw new Error(receipt.saved===false ? "storage_"+receipt.error : "invalid_receipt");
        }
        memory.delete(key);
        try {globalThis.localStorage?.removeItem(key);} catch { /* Retry is safe. */ }
        return receipt;
      } finally {clearTimeout(timer);}
    })();
    flights.set(key,flight);
    flight.finally(()=>flights.delete(key)).catch(()=>{});
    return flight;
  }
  return {send,pending,canonical,digest,get durable(){return durable;}};
})();
