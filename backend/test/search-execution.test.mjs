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
