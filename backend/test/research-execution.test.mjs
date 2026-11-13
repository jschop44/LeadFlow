import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {mapConcurrent,createResearchRunner} from '../research-execution.js';

test('bounded page workers preserve source order despite reverse completion',async()=>{
 let active=0,peak=0;const releases=[];
 const work=mapConcurrent([0,1,2,3,4,5],3,async value=>{
  peak=Math.max(peak,++active);
  await new Promise(resolve=>releases.push(resolve));active--;return value;
 });
 assert.equal(releases.length,3);
 for(let batch=0;batch<2;batch++){releases.splice(0).reverse().forEach(r=>r());await new Promise(setImmediate)}
 assert.deepEqual(await work,[0,1,2,3,4,5]);assert.equal(peak,3);
});

test('research shares identical in-flight work, bounds distinct sites and recovers after errors',async()=>{
 let calls=0;const releases=[];
 const run=createResearchRunner(async website=>{calls++;await new Promise(r=>releases.push(r));if(website==='bad')throw Error('Provider failed');return website});
 const first=run('one');assert.equal(run('one'),first);const second=run('bad');
 await assert.rejects(run('three'),error=>error.statusCode===503&&/capacity/.test(error.message));assert.equal(calls,2);
 const failure=assert.rejects(second,/Provider failed/);releases.splice(0).forEach(r=>r());
 assert.equal(await first,'one');await failure;
 const again=run('one');await new Promise(setImmediate);releases.shift()();assert.equal(await again,'one');assert.equal(calls,3);
});

test('actual enrichment runs allowed pages concurrently and retains partial evidence and attribution',async()=>{
 const code=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const start=code.indexOf('async function research(website)'),end=code.indexOf('const escape=',start);
 let active=0,peak=0;const visited=[];
 const context=vm.createContext({URL,AbortSignal,mapConcurrent,createResearchRunner,console,
  validate:async website=>new URL(website),fetch:async()=>({status:200,ok:true,text:async()=>''}),
  robotsOK:(_,path)=>path!=='/team',wikidataLeadership:async()=>[],
  get:async url=>{visited.push(url);peak=Math.max(peak,++active);await new Promise(setImmediate);active--;if(url.endsWith('/about'))throw Error('Unavailable');return 'content'},
  extract:(_,source)=>({emails:[source+'/mail'],phones:[],socials:[]}),peopleFromStructuredData:()=>[],peopleFromVisibleText:()=>[],
  discoverContactPages:()=>[],mergePublicContactEvidence:sources=>({emails:sources.flatMap(x=>x.emails||[]),phones:[],socials:[],emailEvidence:sources.flatMap(x=>x.emails||[]).map(email=>({email})),namedContacts:[]}),reconcilePublicLeadership:claims=>claims,
  mailDomainInspector:async()=>({}),applyMailDomainEvidence:items=>items,evidenceCount:()=>0});
 vm.runInContext(code.slice(start,end),context);
 const result=await context.research('https://example.org/path');
 assert.equal(peak,3);assert.equal(visited.length,8);assert.equal(result.sources.length,7);
 assert.equal(result.sources[0].url,'https://example.org/');
 assert.ok(!visited.some(url=>url.endsWith('/team')));assert.equal(result.emails.length,7);
});

test('successful public-contact research is cached, bounded and returned as an isolated snapshot',async()=>{
 let clock=0,calls=0;
 const run=createResearchRunner(async()=>({emails:['support@ridgeworks.com'],people:[]}),2,{now:()=>clock,cacheTtlMs:1800000});
 const first=await run('https://ridgeworks.com');first.emails.push('fake');
 const cached=await run('https://ridgeworks.com');assert.equal(cached.cached,true);
 assert.deepEqual(cached.emails,['support@ridgeworks.com']);
 clock+=1800001;
 const fresh=await run('https://ridgeworks.com');
 assert.equal(fresh.cached,undefined);assert.deepEqual(fresh.emails,['support@ridgeworks.com']);
});
