import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostPacer} from '../provider-pacing.js';

test('free shared service requests are strictly serialized with >= 1.1 second spacing',async()=>{
 let now=0;
 const stamps=[],calls=[];
 const pace=createHostPacer({now:()=>now,sleep:async ms=>{now+=ms},minIntervalMs:1100});
 const run=i=>pace('query-'+i,async()=>{stamps.push(now);calls.push(i);return {index:i}});
 const results=await Promise.all([run(1),run(2),run(3)]);
 assert.deepEqual(stamps,[0,1100,2200]);
 assert.deepEqual(calls,[1,2,3]);
 assert.deepEqual(results.map(x=>x.index),[1,2,3]);
});
test('repeat requests use a fresh clone of successful cached data without hitting provider again',async()=>{
 let calls=0,now=0;
 const pace=createHostPacer({now:()=>now,sleep:async ms=>{now+=ms},ttlMs:500});
 const one=pace('same',async()=>{calls++;return {records:[{name:'Public shop'}]}});
 const two=pace('same',async()=>{calls++;return {records:[{name:'Other'}]}});
 const [a,b]=await Promise.all([one,two]);assert.equal(calls,1);
 a.records[0].name='Mutated';
 assert.equal(b.records[0].name,'Public shop');
 assert.equal((await pace('same',async()=>{calls++;return {records:[]}})).records[0].name,'Public shop');
 now+=501;await pace('same',async()=>{calls++;return {records:[]}});assert.equal(calls,2);
});
test('a temporary provider failure releases pace queue without caching a fabricated result',async()=>{
 let call=0;
 const pace=createHostPacer({minIntervalMs:100,now:()=>0,sleep:async()=>{}});
 await assert.rejects(pace('location',async()=>{call++;throw Error('throttled')}),/throttled/);
 await pace('location',async()=>{call++;return {records:[]}});
 assert.equal(call,2);
});
