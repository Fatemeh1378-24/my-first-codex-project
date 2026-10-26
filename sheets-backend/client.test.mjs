import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {runtime} from './storage.test.mjs';
const code=fs.readFileSync(new URL('../web-preview/sheets-client.js',import.meta.url),'utf8');
const fixture=JSON.parse(fs.readFileSync(new URL('fixture.json',import.meta.url),'utf8'));
fixture.participant_id=webcrypto.randomUUID();
function store(){const entries=new Map();return {get length(){return entries.size;},key:i=>[...entries.keys()][i],
 getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};}
function client(storage,fetcher){const ctx={localStorage:storage,fetch:fetcher,URLSearchParams,TextEncoder,
 crypto:webcrypto,AbortController,setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(code,ctx);return ctx.IAT_SHEETS;}
function network(server,onReply=x=>x){return async (_url,opts)=>{
 assert.equal(opts.mode,'cors');assert.equal(opts.credentials,'omit');
 const envelope=JSON.parse(opts.body.get('data'));
 const receipt=server.send(envelope.payload,envelope.kind);
 return onReply(Response.json(receipt));
};}
test('browser and real backend agree on payload digest and save all 33 fields',async()=>{
 const server=runtime(),storage=store(),browser=client(storage,network(server));
 const receipt=await browser.send(fixture);assert.equal(receipt.saved,true);
 assert.equal(server.sheets.get('Results').rows.length,2);assert.equal(storage.length,0);
 assert.deepEqual(JSON.parse(server.sheets.get('Results').rows[1].at(-1)),fixture);
});
test('a lost receipt survives reload; retry uses the same immutable payload and creates no duplicate',async()=>{
 const server=runtime(),storage=store();let lose=true;
 const fetcher=network(server,response=>{if(lose){lose=false;throw new TypeError('lost_reply');}return response;});
 await assert.rejects(client(storage,fetcher).send(fixture));assert.equal(storage.length,1);
 const reloaded=client(storage,fetcher);assert.equal(reloaded.pending().length,1);
 const receipt=await reloaded.send({...fixture,d_score:9});assert.equal(receipt.duplicate,true);
 assert.equal(server.sheets.get('Results').rows.length,2);
 assert.deepEqual(JSON.parse(server.sheets.get('Results').rows[1].at(-1)),fixture);
 assert.equal(reloaded.pending().length,0);
});
test('a mismatched hash, HTML login page, or backend rejection never removes pending results',async()=>{
 for(const fetcher of [async()=>Response.json({saved:true,participant_id:fixture.participant_id,payload_sha256:'wrong'}),
  async()=>new Response('<html>Sign in</html>'),async()=>Response.json({saved:false,error:'busy'})]){
  const storage=store(),browser=client(storage,fetcher);await assert.rejects(browser.send(fixture));
  assert.equal(storage.length,1);assert.equal(browser.pending().length,1);
 }
});
test('concurrent clicks share one flight; blocked local storage still permits confirmed saving',async()=>{
 const server=runtime();let calls=0;
 const fetcher=async(...args)=>{calls++;return network(server)(...args);};
 const storage=store(),browser=client(storage,fetcher);
 await Promise.all([browser.send(fixture),browser.send(fixture)]);assert.equal(calls,1);
 const broken={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
 const other=client(broken,network(server));await other.send(fixture);assert.equal(other.durable,false);
});
