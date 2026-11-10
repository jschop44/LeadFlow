import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedWebsite,verifiedWikidataPeople,createLeadershipLookup} from '../wikidata-leadership.js';
const make=(site,name='Jane Smith',role='Founder')=>({officialWebsite:{value:site},item:{value:'https://www.wikidata.org/entity/Q123'},person:{value:'https://www.wikidata.org/entity/Q456'},personLabel:{value:name},role:{value:role}});
test('matches official domain despite www and trailing slash differences',()=>{
 assert.equal(normalizedWebsite('https://www.example.com/'),normalizedWebsite('https://example.com'));
 assert.equal(verifiedWikidataPeople([make('http://www.example.com/')],'https://example.com').length,1);
});
test('rejects similarly named and maliciously suffixed domains',()=>{
 assert.equal(verifiedWikidataPeople([make('https://example.com.evil.org')],'https://example.com').length,0);
 assert.equal(verifiedWikidataPeople([make('https://other-company.com')],'https://example.com').length,0);
});
test('retains attribution for independently matched founder and CEO',()=>{
 const people=verifiedWikidataPeople([make('https://example.com','Jane Smith','Founder'),make('https://example.com','Alex Morgan','CEO')],'https://example.com');
 assert.equal(people.length,2);
 assert.ok(people.every(x=>x.independentSource==='Wikidata'&&x.source==='https://www.wikidata.org/entity/Q123'));
});
test('rejects ungrounded people and arbitrary external entity URLs',()=>{
 const bad=make('https://example.com','Jane Smith','CEO');bad.person.value='https://evil.example/Q456';
 assert.equal(verifiedWikidataPeople([bad],'https://example.com').length,0);
});

test('accepts Wikidata SPARQL HTTP entity identifiers',()=>{
 const row=make('https://example.com');
 row.item.value='http://www.wikidata.org/entity/Q123';
 row.person.value='http://www.wikidata.org/entity/Q456';
 assert.equal(verifiedWikidataPeople([row],'https://example.com').length,1);
});

test('query timeout falls back to domain-matched entity claims, excluding ended and deprecated leadership',async()=>{
 const calls=[];
 const lookup=createLeadershipLookup({fetcher:async raw=>{
  const url=new URL(raw);calls.push(url);
  if(url.hostname==='query.wikidata.org')throw Error('timeout');
  const action=url.searchParams.get('action');
  if(action==='wbsearchentities')return Response.json({search:[{id:'Q123'},{id:'Q999'}]});
  if(url.searchParams.get('props')==='claims')return Response.json({entities:{
   Q123:{claims:{P856:[{mainsnak:{datavalue:{value:'https://example.com/'}}}],P169:[
    {mainsnak:{datavalue:{value:{id:'Q456'}}}},
    {mainsnak:{datavalue:{value:{id:'Q789'}}},qualifiers:{P582:[{}]}},
    {mainsnak:{datavalue:{value:{id:'Q111'}}},rank:'deprecated'}]}},
   Q999:{claims:{P856:[{mainsnak:{datavalue:{value:'https://example.com.evil.org'}}}],P169:[{mainsnak:{datavalue:{value:{id:'Q222'}}}}]}}
  }});
  assert.equal(url.searchParams.get('ids'),'Q456');
  return Response.json({entities:{Q456:{labels:{en:{value:'Jane Smith'}}}}});
 }});
 const people=await lookup('https://example.com');
 assert.equal(people.length,1);assert.equal(people[0].name,'Jane Smith');assert.equal(people[0].role,'CEO');
 assert.equal(calls.length,4);
 await lookup('https://www.example.com/');assert.equal(calls.length,4);
});

test('coalesces concurrent lookups, bounds distinct work, and cools down outages without claiming success',async()=>{
 let finish,calls=0,clock=0;
 const gate=new Promise(resolve=>{finish=resolve;});
 const lookup=createLeadershipLookup({maxConcurrent:1,now:()=>clock,fetcher:async()=>{calls++;await gate;throw Error('offline');}});
 const a=lookup('https://example.com'),b=lookup('https://www.example.com/');
 await assert.rejects(lookup('https://other.example'),/capacity/);
 finish();await Promise.all([assert.rejects(a,/unavailable/),assert.rejects(b,/unavailable/)]);
 assert.equal(calls,2);await assert.rejects(lookup('https://example.com'),/unavailable/);assert.equal(calls,2);
 clock=30001;await assert.rejects(lookup('https://example.com'),/unavailable/);assert.equal(calls,4);
});

test('cache values cannot be mutated by callers and expire before revalidation',async()=>{
 let calls=0,clock=0;
 const lookup=createLeadershipLookup({now:()=>clock,fetcher:async()=>{calls++;return Response.json({results:{bindings:[make('https://example.com')]}});}});
 const people=await lookup('https://example.com');people[0].name='Changed';
 assert.equal((await lookup('https://example.com'))[0].name,'Jane Smith');assert.equal(calls,1);
 clock=3600001;await lookup('https://example.com');assert.equal(calls,2);
});
