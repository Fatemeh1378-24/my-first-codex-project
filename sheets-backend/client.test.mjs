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

function studyBrowser(storage,fetcher){
 const html=fs.readFileSync(new URL('../web-preview/index.html',import.meta.url),'utf8');
 const nodes=[...html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)].map(([tag,id])=>({
  id,hidden:/\bhidden\b/.test(tag),textContent:'',className:'',addEventListener(){},
  querySelector:()=>({classList:{toggle(){}},scrollIntoView(){}})
 }));
 const form=nodes.find(n=>n.id==='mfq-form');
 form.values=Object.fromEntries(Object.entries(fixture.mfq_responses).map(([k,v])=>[k,String(v)]));
 const ctx={document:{querySelectorAll:()=>nodes,addEventListener(){}},window:{addEventListener(){}},
  localStorage:storage,fetch:fetcher,URLSearchParams,TextEncoder,crypto:webcrypto,AbortController,
  setTimeout,clearTimeout,location:{search:'?group=1'},console:{error(){}},
  FormData:class{constructor(form){this.values=form.values;}get(k){return this.values[k]??null;}}};
 vm.createContext(ctx);
 for(const file of ['sdo-data.js','sdo-scoring.js','questionnaire-data.js','mfq-scoring.js','sheets-client.js','app.js']){
  vm.runInContext(fs.readFileSync(new URL('../web-preview/'+file,import.meta.url),'utf8'),ctx);
 }
 return {ctx,nodes,node:id=>nodes.find(n=>n.id===id)};
}

test('the actual MFQ completion flow sends all fields to Sheets and exposes no scores to participants',async()=>{
 const server=runtime(),storage=store(),study=studyBrowser(storage,network(server));
 const app=fs.readFileSync(new URL('../web-preview/app.js',import.meta.url),'utf8');
 const map=app.split('function participantInsertPayload(scores) {')[1].split('\n}')[0];
 const scores=Object.fromEntries([...map.matchAll(/([a-z_0-9]+): scores\.([A-Za-z_0-9]+)/g)].map(([,column,key])=>[key,fixture[column]]));
 vm.runInContext(`state.scores=${JSON.stringify(scores)};
  state.sdoResponses=${JSON.stringify(fixture.sdo_responses)};state.sdoScore=3;
  el['mfq-questionnaire'].hidden=false;
  submitMfq({preventDefault(){},currentTarget:el['mfq-form']});`,study.ctx);
 // submitMfq starts asynchronous saving; join its existing in-flight request.
 await vm.runInContext('saveParticipantResults(state.scores)',study.ctx);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(server.sheets.get('Results').rows.length,2);
 assert.deepEqual(JSON.parse(server.sheets.get('Results').rows[1].at(-1)),fixture);
 assert.equal(study.node('completion-message').hidden,false);
 assert.equal(study.node('save-result').hidden,true);
 assert.equal(storage.length,0);
});

test('the actual app restores a completed offline submission after reload and waits for a confirmed receipt',async()=>{
 const server=runtime(),storage=store();
 await assert.rejects(client(storage,async()=>{throw new TypeError('offline');}).send(fixture));
 const failed=studyBrowser(storage,async()=>{throw new TypeError('offline');});
 assert.equal(failed.node('intro').hidden,true);
 assert.equal(failed.node('summary').hidden,false);
 assert.equal(failed.node('completion-message').hidden,true);
 await vm.runInContext('submitResults()',failed.ctx);
 assert.equal(failed.node('completion-message').hidden,true);
 assert.equal(failed.node('retry-save-button').hidden,false);
 const recovered=studyBrowser(storage,network(server));
 await vm.runInContext('submitResults()',recovered.ctx);
 assert.equal(recovered.node('completion-message').hidden,false);
 assert.equal(recovered.node('save-result').hidden,true);
 assert.equal(storage.length,0);
 assert.deepEqual(JSON.parse(server.sheets.get('Results').rows[1].at(-1)),fixture);
});
