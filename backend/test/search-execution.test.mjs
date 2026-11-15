import test from 'node:test';
import assert from 'node:assert/strict';
import {createSearchRunner} from '../search-execution.js';
test('equivalent concurrent searches coalesce and distinct searches are bounded',async()=>{
 let calls=0,release;const gate=new Promise(r=>{release=r;});
 const run=createSearchRunner(async(area,niche)=>{calls++;await gate;return {elements:[{area,niche}]};});
 const a=run(' New York ','Accountants'),b=run('new york','Accountants'),c=run('Boston','Accountants');
 assert.equal(a,b);await assert.rejects(run('Dallas','Accountants'),e=>e.statusCode===503);
 release();assert.equal((await a).elements[0].area,'new york');await c;assert.equal(calls,2);
});
test('provider failure cools down briefly without converting missing data into success',async()=>{
 let now=0,calls=0;const run=createSearchRunner(async()=>{calls++;return {searchStatus:'provider_unavailable',elements:[]};},{now:()=>now,unavailableTtlMs:1000});
 await run('10001','Financial advisors');now=200;const cached=await run('10001','Financial advisors');
 assert.equal(cached.searchStatus,'provider_unavailable');assert.equal(cached.cached,true);assert.equal(cached.retryAfterSeconds,1);assert.equal(calls,1);
 now=1001;await run('10001','Financial advisors');assert.equal(calls,2);
});
test('failed operations release slots and invalid inputs never call providers',async()=>{
 let calls=0;const run=createSearchRunner(async()=>{calls++;throw Error('unavailable');},{capacity:1});
 await assert.rejects(run({},'Accountants'),/valid city/);assert.equal(calls,0);
 await assert.rejects(run('Boston','Accountants'),/unavailable/);await assert.rejects(run('Boston','Accountants'),/unavailable/);assert.equal(calls,2);
});

test('equivalent area spellings and spaces share one bounded provider request',async()=>{
 let calls=0,release;const gate=new Promise(resolve=>{release=resolve});
 const run=createSearchRunner(async(area,niche)=>{calls++;await gate;return {elements:[{area,niche}]};});
 const one=run(' BEL   AIR  ','Financial Advisors');
 const two=run('bel air','Financial advisors');
 assert.equal(one,two,'equivalent niche/area searches should share in-flight work');
 release();assert.equal((await one).elements[0].area,'bel air');assert.equal(calls,1);
});

test('cached outage evidence is isolated from caller mutations and each later request',async()=>{
 let clock=0,requests=0;
 const run=createSearchRunner(async()=>{requests++;return {
  searchStatus:'provider_unavailable',elements:[{tags:{name:'Original business'}}],
  sourceAgreement:['public_provider_timeout']
 }},{now:()=>clock,unavailableTtlMs:1000});
 const first=await run('10001','Financial advisors');
 first.elements[0].tags.name='Poisoned';
 first.sourceAgreement.push('fake_source');
 clock=100;
 const cached=await run('10001','Financial advisors');
 assert.equal(cached.cached,true);
 assert.equal(cached.elements[0].tags.name,'Original business');
 assert.deepEqual(cached.sourceAgreement,['public_provider_timeout']);
 cached.elements.push({tags:{name:'Injected record'}});
 const again=await run('10001','Financial advisors');
 assert.equal(again.elements.length,1);
 assert.equal(requests,1,'outage cache prevents repeated provider calls');
});

test('provider category casing is preserved for exact case-sensitive niche catalogs',async()=>{
 let nicheSeen='';
 const run=createSearchRunner(async(_area,niche)=>{nicheSeen=niche;return {elements:[]};});
 await run('Boston','Financial advisors');
 assert.equal(nicheSeen,'Financial advisors','do not lowercase the canonical provider lookup key');
});
