import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {wakeIntelligence} from '../scripts/wake-intelligence.mjs';
const now=Date.parse('2026-11-10T12:00:00Z');
const input={token:'synthetic-test-token',event:'schedule',runId:'123',now:()=>now};
const response=data=>new Response(JSON.stringify(data));
test('an authenticated fresh cycle is verified without exposing its token',async()=>{
 const result=await wakeIntelligence({...input,fetcher:async(url,options)=>{
  assert.equal(url,'https://leadflow-research-api.onrender.com/automation');assert.equal(options.redirect,'error');
  assert.equal(options.headers['X-LeadFlow-Token'],input.token);assert.equal(JSON.parse(options.body).trigger,'schedule');
  return response({enabled:true,lastRun:new Date(now).toISOString(),websitesResearched:2});
 }});
 assert.equal(result.status,'completed');assert.equal(result.websitesResearched,2);assert.ok(!JSON.stringify(result).includes(input.token));
});
test('missing token, unauthorized requests and disabled or failed cycles cannot pass',async()=>{
 await assert.rejects(wakeIntelligence({...input,token:''}),/required/);
 await assert.rejects(wakeIntelligence({...input,fetcher:async()=>new Response('',{status:401})}),/HTTP 401/);
 for(const result of [{enabled:false},{enabled:true,error:'database unavailable'},{enabled:true},{enabled:true,lastRun:'2026-11-05T00:00:00Z'}])await assert.rejects(wakeIntelligence({...input,fetcher:async()=>response(result)}));
});
test('overlapping cycles are marked deferred rather than falsely completed',async()=>{
 for(const result of [{enabled:true,running:true},{enabled:true,skipped:true}])assert.equal((await wakeIntelligence({...input,fetcher:async()=>response(result)})).status,'deferred');
});
test('the recurring workflow has no expired guard and always uploads real wake evidence',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/intelligence-schedule.yml',import.meta.url),'utf8');
 assert.match(workflow,/cron: '30 \* \* \* \*'/);assert.doesNotMatch(workflow,/date_guard|one_time_guard|2026-11-05/);
 assert.match(workflow,/node scripts\/wake-intelligence.mjs/);assert.match(workflow,/path: schedule-wake-evidence.json/);
});
