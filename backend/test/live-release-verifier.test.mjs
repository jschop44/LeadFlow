import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLiveRevision,LIVE_API} from '../../scripts/verify-live-release.mjs';

const SHA='a'.repeat(40),OLD='b'.repeat(40);

test('live verifier waits for the exact new deployment and confirms authorization',async()=>{
 const urls=[],pause=[];
 const fetcher=async(url,options)=>{
  urls.push({url,method:options.method||'GET'});
  if(url.endsWith('/enrich'))return Response.json({error:'Unauthorized'},{status:401});
  const count=urls.filter(row=>row.url.endsWith('/health')).length;
  return Response.json({status:'ok',release:count<3?OLD:SHA});
 };
 const result=await verifyLiveRevision(SHA,{fetcher,pause:async ms=>{pause.push(ms)},attempts:4});
 assert.equal(result.status,'verified');
 assert.equal(result.release,SHA);
 assert.equal(result.attempts,3);
 assert.equal(result.unauthenticatedEnrichStatus,401);
 assert.deepEqual(pause,[10000,10000]);
 assert.equal(urls.length,4,'one private-route probe only after exact revision matches');
 assert.deepEqual(urls.at(-1),{url:LIVE_API+'/enrich',method:'POST'});
});

test('rejects a healthy but stale Render revision instead of claiming deployment',async()=>{
 let attempts=0;
 await assert.rejects(verifyLiveRevision(SHA,{
  fetcher:async()=>{attempts++;return Response.json({status:'ok',release:OLD})},
  pause:async()=>{},attempts:2,
 }),/did not serve the expected verified revision/);
 assert.equal(attempts,2);
});

test('refuses a matching revision if the protected enrichment endpoint is open',async()=>{
 const fetcher=async url=>url.endsWith('/health')
  ?Response.json({status:'ok',release:SHA})
  :Response.json({leads:[]},{status:200});
 await assert.rejects(verifyLiveRevision(SHA,{fetcher,pause:async()=>{},attempts:1}),/authorization check failed/);
});

test('limits work and accepts only the pinned public API and a real commit hash',async()=>{
 await assert.rejects(verifyLiveRevision('latest',{attempts:1}),/Invalid expected/);
 await assert.rejects(verifyLiveRevision(SHA,{base:'https://other.example',attempts:1}),/restricted/);
 await assert.rejects(verifyLiveRevision(SHA,{attempts:100}),/probe budget/);
});
