import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { runtime } from '../sheets-backend/storage.test.mjs';

const source=fs.readFileSync(new URL('app.js',import.meta.url),'utf8');
const fixture=JSON.parse(fs.readFileSync(new URL('../sheets-backend/fixture.json',import.meta.url),'utf8'));
const context={document:{querySelectorAll:()=>[]},crypto:webcrypto,URLSearchParams,location:{search:'?group=1'}};
vm.createContext(context);
vm.runInContext(source.slice(0,source.indexOf('document.addEventListener("keydown"'))+`
this.api={calculateScores,buildSequence,iatRawTrials,interpretIatScore,state,participantInsertPayload};`,context);
const api=context.api;
function trials(group=1) {
  return api.buildSequence(group).flatMap(b=>b.trials.map((t,i)=>({...t,
    part:b.part,condition:b.targetAOnLeft?'compatible':'incompatible',
    blockLength:b.count===20?'short':'long',initialCorrect:i%10!==0,
    initialResponse:i%10===0?(t.correct==='left'?'right':'left'):t.correct,
    response:t.correct,responseMethod:'keyboard',
    latency:(b.targetAOnLeft?500:700)+i%7*35,
    firstLatency:i%10===0?300:(b.targetAOnLeft?500:700)+i%7*35
  })));
}
function payload(ts=trials()) {
  api.state.trials=ts;
  api.state.sdoResponses=fixture.sdo_responses;api.state.sdoScore=fixture.sdo_score;
  api.state.mfqResponses=fixture.mfq_responses;api.state.mfqDomainScores=fixture.mfq_domain_scores;
  const p=api.participantInsertPayload({...api.calculateScores(ts),Participant_ID:webcrypto.randomUUID()});
  const normalized=JSON.parse(JSON.stringify(p));
  return {...fixture,...normalized,group_number:1,age:25,gender:'زن',education_level:'آزمایشی',
    employment_status:'آزمایشی',monthly_income:'آزمایشی',religiosity:'آزمایشی'};
}
const plain=x=>JSON.parse(JSON.stringify(x));

test('all 180 raw trials survive storage, including corrected and >10s responses, and reproduce D',()=>{
  const ts=trials();ts[45].latency=10001;
  const p=payload(ts),server=runtime();
  assert.equal(p.iat_trials.length,180);
  assert.equal(server.send(p).saved,true);
  const sheet=server.sheets.get('Results'),row=sheet.rows[1],headers=sheet.rows[0];
  assert.deepEqual(JSON.parse(row[headers.indexOf('iat_trials')]),p.iat_trials);
  assert.deepEqual(JSON.parse(row[headers.indexOf('payload_json')]),p);
  assert.equal(p.iat_trials[45].rt,10001);
  assert.equal(p.iat_trials[40].correct,false);
  assert.equal(p.iat_trials[40].first_rt,300);
  assert.notEqual(p.iat_trials[40].initial,p.iat_trials[40].response);
  const reconstructed=p.iat_trials.map(t=>({
    part:t.block,category:t.category,value:t.stimulus,latency:t.rt,initialCorrect:t.correct,
    condition:t.block<5?'compatible':'incompatible',blockLength:[3,6].includes(t.block)?'short':'long'
  }));
  assert.equal(api.calculateScores(reconstructed).D_score,p.d_score);
  assert.equal(server.send(p).duplicate,true);
  assert.ok(row[headers.indexOf('payload_json')].length<49000);
});

test('valid D remains identical to the prior scorer in both counterbalanced orders',()=>{
  for(const group of [1,2]){
    const ts=trials(group),score=api.calculateScores(ts);
    const cell=(condition,length)=>ts.filter(t=>[3,4,6,7].includes(t.part)&&t.condition===condition&&t.blockLength===length).map(t=>t.latency);
    const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
    const components=['short','long'].map(length=>{
      const a=cell('compatible',length),b=cell('incompatible',length),all=[...a,...b],m=avg(all);
      return (avg(b)-avg(a))/Math.sqrt(all.reduce((s,v)=>s+(v-m)**2,0)/(all.length-1));
    });
    assert.equal(score.D_score,avg(components));
    assert.equal(score.excludeCriteriaMet,false);
    assert.equal(score.iat_interpretation.direction,'iranian');
  }
});

test('Millisecond interpretation boundaries are symmetric and suppress invalid/excluded feedback',()=>{
  const q={valid:true,excluded:false};
  for(const sign of [-1,1]) for(const [n,strength] of [[0,'little_to_no'],[.15,'little_to_no'],[.1501,'slight'],[.35,'slight'],[.3501,'moderate'],[.6499,'moderate'],[.65,'strong']]){
    const result=api.interpretIatScore(sign*n,q);
    assert.equal(result.strength,strength);
    assert.equal(result.direction,n<=.15?'little_to_no':sign>0?'iranian':'afghan');
  }
  assert.deepEqual(plain(api.interpretIatScore(.8,{valid:false,excluded:true})),{status:'invalid',direction:null,strength:null});
  assert.deepEqual(plain(api.interpretIatScore(.8,{valid:true,excluded:true})),{status:'excluded',direction:null,strength:null});
});

test('fast exclusion remains >10% of 120 combined trials and keeps the existing Millisecond denominator',()=>{
  const ts=trials(),combined=ts.filter(t=>[3,4,6,7].includes(t.part));
  combined.slice(0,12).forEach(t=>{t.latency=250;t.firstLatency=200;});
  combined[20].latency=10001;
  assert.equal(api.calculateScores(ts).propRT300,.1);
  assert.equal(api.calculateScores(ts).excludeCriteriaMet,false);
  combined[12].latency=250;combined[12].firstLatency=200;
  const s=api.calculateScores(ts);
  assert.equal(s.excludeCriteriaMet,true);
  assert.ok(s.iat_quality.reasons.includes('too_many_fast_responses'));
  assert.equal(s.iat_quality.valid,true);
  assert.equal(s.iat_interpretation.strength,null);
});

test('empty cells, zero variance, incomplete blocks and nonfinite RTs explicitly flag exclusion',()=>{
  const scenarios=[
    [trials().map(t=>t.part===3?{...t,latency:10001}:t),'empty_scoring_cell'],
    [trials().map(t=>({...t,latency:500})),'zero_variance'],
    [trials().slice(0,-1),'incomplete_test_blocks'],
    [trials().map((t,i)=>i===40?{...t,latency:NaN}:t),'invalid_latency']
  ];
  for(const [ts,reason] of scenarios){
    const s=api.calculateScores(ts);
    assert.equal(s.excludeCriteriaMet,true,reason);
    assert.equal(s.iat_quality.valid,false,reason);
    assert.ok(s.iat_quality.reasons.includes(reason),reason);
    assert.equal(s.iat_interpretation.status,'invalid');
    if(reason==='empty_scoring_cell'||reason==='zero_variance')assert.equal(s.D_score,null);
  }
});

test('10,000ms is included; 10,001ms is retained raw but omitted from D',()=>{
  const ts=trials();ts[40].latency=10000;
  assert.equal(api.calculateScores(ts).iat_quality.retained_trials,120);
  ts[40].latency=10001;
  const s=api.calculateScores(ts);
  assert.equal(s.iat_quality.retained_trials,119);assert.equal(s.iat_quality.slow_trials,1);
  assert.equal(s.excludeCriteriaMet,false);
});

test('upgrading a legacy sheet appends headers without altering old values, JSON or duplicate receipts',()=>{
  const server=runtime();const old={...fixture,participant_id:webcrypto.randomUUID()};
  assert.equal(server.send(old).saved,true);
  const sheet=server.sheets.get('Results');
  sheet.rows[0].splice(94);sheet.rows[1].splice(94);
  const before=JSON.stringify(sheet.rows[1]),hash=sheet.rows[1][92];
  assert.equal(server.send(payload()).saved,true);
  assert.equal(JSON.stringify(sheet.rows[1]),before);
  assert.equal(sheet.rows[0].length,97);
  const retry=server.send(old);
  assert.equal(retry.duplicate,true);assert.equal(retry.payload_sha256,hash);
  assert.equal(sheet.rows.length,3);
});

test('malformed trial records and partial new schemas are rejected without losing legacy support',()=>{
  const p=payload(),server=runtime();
  const partial={...p};delete partial.iat_quality;
  assert.equal(server.send(partial).saved,false);
  for(const changes of [{rt:-1},{rt:Infinity},{trial:2},{stimulus:'x'.repeat(101)},{initial:'invalid'},{correct:'yes'}]){
    const bad=structuredClone(p);Object.assign(bad.iat_trials[0],changes);
    assert.equal(server.send(bad).saved,false);
  }
  assert.equal(server.sheets.size,0);
});

test('the copyable Apps Script exactly matches the tested backend',()=>{
  const setup=fs.readFileSync(new URL('setup-storage.html',import.meta.url),'utf8');
  const embedded=setup.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1]
    .replaceAll('&quot;','"').replaceAll('&#x27;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
  assert.equal(embedded,fs.readFileSync(new URL('../sheets-backend/Code.gs',import.meta.url),'utf8'));
});
