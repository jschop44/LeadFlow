import test from 'node:test';
import assert from 'node:assert/strict';
import {registryState,exactRegistryQuery,createOfficialRegistryLookup} from '../integrations/official-registries.js';

test('state adapter uses only official open-data hosts and escapes company names in exact SoQL matching',()=>{
 assert.equal(registryState('new york'),'NY');
 assert.equal(registryState('CO'),'CO');
 assert.equal(registryState('CA'),null);
 const d={host:'data.ny.gov',id:'n9v6-gdp6',field:'current_entity_name',select:'dos_id,current_entity_name'};
 const q=exactRegistryQuery("O'BRIEN & SONS, LLC",d).url;
 assert.equal(q.hostname,'data.ny.gov');
 assert.equal(q.searchParams.get('$where'),"upper(current_entity_name) = 'O''BRIEN & SONS, LLC'");
 assert.equal(q.searchParams.get('$limit'),'5');
 assert.throws(()=>exactRegistryQuery("Acme'; DROP TABLE x --",d),/exact legal company/);
});
test('NY open-company records label published CEO claim without treating it as an owner or private contact',async()=>{
 let calls=0;
 const lookup=createOfficialRegistryLookup({fetcher:async raw=>{
  calls++;const u=new URL(raw);
  assert.equal(u.hostname,'data.ny.gov');
  assert.equal(u.pathname,'/resource/n9v6-gdp6.json');
  return Response.json([{dos_id:'2468',current_entity_name:'RidgeWorks LLC',entity_type:'Domestic Limited Liability Company',chairman_name:'Robin Sanchez',county:'Erie'}]);
 }});
 const result=await lookup({name:'ridgeworks llc',state:'NY'});
 assert.equal(result.status,'possible_legal_name_match');
 assert.equal(result.matches.length,1);
 assert.equal(result.matches[0].publicRole.name,'Robin Sanchez');
 assert.equal(result.matches[0].publicRole.verifiedOwner,false);
 assert.ok(result.note.includes('not establish'));
 assert.equal(JSON.stringify(result).includes('chairman_address'),false);
 await lookup({name:'ridgeworks llc',state:'NY'});
 assert.equal(calls,1);
});
test('Colorado records identify only public registered agents, not owners',async()=>{
 const lookup=createOfficialRegistryLookup({fetcher:async url=>{
  assert.equal(new URL(url).hostname,'data.colorado.gov');
  return Response.json([{entityid:'123',entityname:'High Mesa LLC',entitystatus:'Good Standing',entitytype:'DLLC',
   agentfirstname:'Taylor',agentlastname:'Morgan',agentprincipaladdress1:'Private residential address must never be returned',principalcity:'Denver'}]);
 }});
 const result=await lookup({name:'High Mesa LLC',state:'Colorado'});
 assert.equal(result.matches[0].entityStatus,'Good Standing');
 assert.match(result.matches[0].publicRole.role,/Registered agent/);
 assert.equal(result.matches[0].publicRole.verifiedOwner,false);
 assert.equal(JSON.stringify(result).includes('Private residential address'),false);
 assert.equal(result.dataset,'https://data.colorado.gov/d/4ykn-tg5h');
});
test('missing exact match is not interpreted as proof that a business does not exist',async()=>{
 const lookup=createOfficialRegistryLookup({fetcher:async()=>Response.json([])});
 const result=await lookup({name:'Unmatched Business LLC',state:'NY'});
 assert.equal(result.status,'no_exact_legal_name_match');
 assert.deepEqual(result.matches,[]);
 assert.match(result.coverage,/snapshot/);
 await assert.rejects(lookup({name:'Unmatched Business LLC',state:'CA'}),/supports New York/);
});
test('provider outage does not fabricate filings',async()=>{
 const lookup=createOfficialRegistryLookup({fetcher:async()=>new Response('Rate limited',{status:429})});
 await assert.rejects(lookup({name:'High Mesa LLC',state:'CO'}),/unavailable/);
});
