import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('Code.gs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../web-preview/app.js',import.meta.url),'utf8');
const fields=JSON.parse(fs.readFileSync(new URL('fields.json',import.meta.url),'utf8'));
const ui={document:{querySelectorAll:()=>[]},crypto:webcrypto,URLSearchParams,location:{search:''}};
vm.createContext(ui);
vm.runInContext(app.slice(0,app.indexOf('document.addEventListener("keydown"'))+`
this.makePayload = () => participantInsertPayload({
 Participant_ID:SESSION_PARTICIPANT_ID, Group:1, Age:25, Gender:'زن',
 Education_Level:'کارشناسی',Employment_Status:'شاغل',Monthly_Income:'متوسط',Religiosity:'متوسط',
 ...calculateScores([])});
state.sdoResponses=Object.fromEntries(Array.from({length:16},(_,i)=>['sdo_'+String(i+1).padStart(2,'0'),3]));
state.sdoScore=3;
state.mfqResponses=Object.fromEntries(Array.from({length:36},(_,i)=>['mfq_'+String(i+1).padStart(2,'0'),2]));
state.mfqDomainScores={care:2,equality:2,proportionality:2,loyalty:2,authority:2,purity:2};
`,ui);
const p=JSON.parse(JSON.stringify(ui.makePayload()));
Object.assign(p,{mean_rt_female_faces:520,mean_rt_male_faces:590,gender_rt_difference:70,
 d_short:0.25,d_long:0.55,d_score:0.4});

function sheetMock(){
 const rows=[];let columns=26,maxRows=1000;
 function range(r,c,n=1,m=1){return {
   setValues(values){assert.equal(values.length,n);assert.ok(c+m-1<=columns);values.forEach((row,i)=>{
     rows[r-1+i] ||= [];row.forEach((v,j)=>rows[r-1+i][c-1+j]=v);
   });return this;},
   getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>rows[r-1+i]?.[c-1+j]??''));},
   createTextFinder(id){return {matchEntireCell(){return this;},useRegularExpression(){return this;},findAll(){
     return rows.slice(r-1,r-1+n).flatMap((row,i)=>row?.[c-1]===id?[{getRow:()=>r+i}]:[]);
   }};}
 };}
 return {rows,getRange:range,getLastRow:()=>rows.length,getMaxColumns:()=>columns,
   insertColumnsAfter(_c,n){columns+=n;},getMaxRows:()=>maxRows,insertRowsAfter(_r,n){maxRows+=n;},setFrozenRows(){}};
}
export function runtime(){
 const sheets=new Map();const lock={available:true,tryLock(){return this.available;},releaseLock(){this.released=true;}};
 const ctx={ContentService:{MimeType:{JSON:'json'},createTextOutput(body){return {body,setMimeType(){return this;}};}},
   SpreadsheetApp:{openById(id){assert.equal(id,'1RzEr-4xNB1oVIkXj35Fn48EKWujt0enh9jwpKfmAC58');return {
     getSheetByName:name=>sheets.get(name),insertSheet(name){const sheet=sheetMock();sheets.set(name,sheet);return sheet;}};},flush(){}},
   LockService:{getScriptLock:()=>lock},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
     computeDigest(_a,text){return [...createHash('sha256').update(text).digest()].map(b=>b>127?b-256:b);}}};
 vm.createContext(ctx);vm.runInContext(source+'\nthis.headers=IAT_HEADERS;this.fields=IAT_FIELDS;',ctx);
 const send=(payload=p,kind='results')=>JSON.parse(ctx.doPost({parameter:{data:JSON.stringify({schema_version:1,kind,payload})}}).body);
 return {ctx,sheets,lock,send};
}

test('backend field names exactly match all 33 existing Supabase payload fields',()=>{
 const r=runtime();assert.deepEqual([...r.ctx.fields],fields);assert.equal(fields.length,33);
});
test('all scores, demographics and 52 raw questionnaire answers are preserved and readable',()=>{
 const r=runtime();const result=r.send();assert.equal(result.saved,true);
 const sheet=r.sheets.get('Results');assert.equal(sheet.rows.length,2);
 const headers=sheet.rows[0],row=sheet.rows[1];assert.equal(headers.length,94);
 for(const field of fields){const cell=row[headers.indexOf(field)];
   if(p[field]===null)assert.equal(cell,'');
   else if(typeof p[field]==='object')assert.deepEqual(JSON.parse(cell),p[field]);
   else assert.equal(cell,p[field],field);
 }
 assert.deepEqual(JSON.parse(row[headers.indexOf('payload_json')]),p);
 for(let i=1;i<=16;i++)assert.equal(row[headers.indexOf('sdo_'+String(i).padStart(2,'0'))],3);
 for(let i=1;i<=36;i++)assert.equal(row[headers.indexOf('mfq_'+String(i).padStart(2,'0'))],2);
 assert.equal(row[headers.indexOf('gender_rt_difference')],70);assert.equal(row[headers.indexOf('d_score')],0.4);
 assert.equal(result.payload_sha256,row[headers.indexOf('payload_sha256')]);
});
test('retry with the same ID/data returns the same receipt and adds no row',()=>{
 const r=runtime();const one=r.send(),two=r.send();assert.equal(one.saved,true);assert.equal(two.duplicate,true);
 assert.equal(one.payload_sha256,two.payload_sha256);assert.equal(r.sheets.get('Results').rows.length,2);
});
test('changed results with an existing ID are rejected without modifying the original',()=>{
 const r=runtime();r.send();const before=JSON.stringify(r.sheets.get('Results').rows);
 assert.equal(r.send({...p,d_score:0.9}).error,'id_conflict');assert.equal(JSON.stringify(r.sheets.get('Results').rows),before);
});
test('invalid/missing fields and incomplete questionnaire responses do not write rows',()=>{
 const r=runtime();for(const bad of [{...p,age:18},{...p,mfq_responses:{}},{...p,unknown:'bad'}])assert.equal(r.send(bad).saved,false);
 const missing={...p};delete missing.gender_rt_difference;assert.equal(r.send(missing).saved,false);
 assert.equal(r.sheets.size,0);
});
test('lock contention and a database write failure do not acknowledge saving',()=>{
 const r=runtime();r.lock.available=false;assert.equal(r.send().error,'busy');assert.equal(r.sheets.size,0);
 r.lock.available=true;r.ctx.SpreadsheetApp.openById=()=>{throw new Error('quota');};
 assert.equal(r.send().error,'storage_unavailable');assert.equal(r.lock.released,true);
});
test('synthetic probes are stored separately; GET never returns participant results',()=>{
 const r=runtime();assert.equal(r.send(p,'probe').saved,true);assert.equal(r.sheets.has('Results'),false);
 assert.equal(r.sheets.get('StorageChecks').rows.length,2);const health=JSON.parse(r.ctx.doGet().body);
 assert.equal(health.schema_version,1);assert.equal(health.payload,undefined);assert.equal(health.rows,undefined);
});
test('edited headers fail closed and formula-like input stays text with original preserved in JSON',()=>{
 const r=runtime();const formula={...p,education_level:'=1+1'};assert.equal(r.send(formula).saved,true);
 const sheet=r.sheets.get('Results');assert.equal(sheet.rows[1][4],'\u200b=1+1');
 assert.equal(JSON.parse(sheet.rows[1].at(-1)).education_level,'=1+1');
 sheet.rows[0][0]='changed';assert.equal(r.send().error,'headers_changed');
});
test('a failed readback is not acknowledged and an exact retry resolves a lost receipt',()=>{
 const r=runtime();r.ctx.SpreadsheetApp.flush=()=>{throw new Error('reply interrupted');};
 assert.equal(r.send().saved,false);assert.equal(r.sheets.get('Results').rows.length,2);
 r.ctx.SpreadsheetApp.flush=()=>{};assert.equal(r.send().duplicate,true);assert.equal(r.sheets.get('Results').rows.length,2);
});
