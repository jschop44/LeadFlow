import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageSpeedAuditor} from '../integrations/pagespeed.js';
import {createHubSpotCompanySync} from '../integrations/hubspot.js';

test('PageSpeed uses Google Lighthouse categories, normalized scores and cached results',async()=>{
 let calls=0,time=0;
 const auditor=createPageSpeedAuditor({now:()=>time,apiKey:'',fetcher:async url=>{
  calls++;const u=new URL(url);
  assert.equal(u.hostname,'www.googleapis.com');
  assert.equal(u.searchParams.get('strategy'),'mobile');
  assert.equal(u.searchParams.getAll('category').length,4);
  assert.equal(u.searchParams.get('key'),null);
  return Response.json({lighthouseResult:{categories:{performance:{score:.57},accessibility:{score:.91},seo:{score:.8},'best-practices':{score:null}},audits:{'unused-javascript':{title:'Reduce unused JavaScript',score:0.2,scoreDisplayMode:'numeric',displayValue:'500 KiB'}}}});
 }});
 const data=await auditor('https://example.com/');assert.equal(data.provider,'Google PageSpeed Insights / Lighthouse');
 assert.equal(data.scores.performance,57);assert.equal(data.scores.bestPractices,null);
 assert.equal(data.opportunities[0].title,'Reduce unused JavaScript');
 const cached=await auditor('https://example.com/');assert.equal(cached.cached,true);assert.equal(calls,1);
 time=7*3600000;await auditor('https://example.com/');assert.equal(calls,2);
});
test('PageSpeed fails visibly instead of manufacturing a score',async()=>{
 const audit=createPageSpeedAuditor({fetcher:async()=>new Response('{}',{status:429})});
 await assert.rejects(audit('https://example.com'),/quota reached/);
 await assert.rejects(audit('http://example.com'),/HTTPS/);
});
test('HubSpot manual sync creates a company only after a domain search',async()=>{
 const calls=[];
 const crm=createHubSpotCompanySync({token:'test-server-only',fetcher:async(url,options)=>{
  calls.push({url,options});
  assert.equal(options.headers.authorization,'Bearer test-server-only');
  if(url.endsWith('/search'))return Response.json({results:[]});
  return Response.json({id:'123'});
 }});
 assert.equal(crm.configured,true);
 const result=await crm.sync({name:'Acme Services',website:'https://www.acme.example',phone:'555-010-1500'});
 assert.equal(result.status,'created');assert.equal(result.domain,'acme.example');
 assert.equal(calls.length,2);assert.equal(JSON.parse(calls[0].options.body).filterGroups[0].filters[0].value,'acme.example');
 assert.equal(JSON.parse(calls[1].options.body).properties.name,'Acme Services');
 assert.equal(JSON.stringify(result).includes('test-server-only'),false);
});
test('HubSpot updates matching domain without creating a duplicate',async()=>{
 const methods=[];
 const crm=createHubSpotCompanySync({token:'test-server-only',fetcher:async(url,options)=>{
  methods.push(options.method+':'+url);
  if(url.endsWith('/search'))return Response.json({results:[{id:'abc-123'}]});
  return Response.json({id:'abc-123'});
 }});
 const result=await crm.sync({name:'Existing Company',website:'https://www.example.org/path'});
 assert.equal(result.status,'updated');assert.ok(methods[1].includes('PATCH:'));
 assert.ok(methods[1].endsWith('/abc-123'));
});
test('HubSpot rejects missing auth, invalid websites and ambiguous duplicates',async()=>{
 const missing=createHubSpotCompanySync({token:''});
 await assert.rejects(missing.sync({name:'Acme Company',website:'https://acme.example'}),/not configured/);
 const crm=createHubSpotCompanySync({token:'secret',fetcher:async()=>Response.json({results:[{id:'1'},{id:'2'}]})});
 await assert.rejects(crm.sync({name:'Company',website:'https://example.com'}),/Multiple/);
 await assert.rejects(crm.sync({name:'Company',website:'http://example.com'}),/HTTPS/);
 await assert.rejects(crm.sync({name:'Company',website:'https://127.0.0.1'}),/HTTPS/);
});
