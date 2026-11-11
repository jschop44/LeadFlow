import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from '../worker/src/index.js';

const tenantId='4500e918-8bb9-4639-9f69-7cfe6456bba3';
const eventId='99e616cd-0d93-4ce8-b36a-89475be63823';
const secret='o'.repeat(64);
const url='https://forge.example.test/api/integrations/v1/events';
const request=(body,token)=>new Request('https://leadflow.example.test/forge/events',{
 method:'POST',headers:{'content-type':'application/json',...(token?{'x-leadflow-token':token}:{})},
 body:JSON.stringify(body)
});
const input={tenantId,businessName:'Harbor Coffee',consent:true,website:'https://example.com'};

test('Forge Worker forwarding fails closed when the private API token is not configured',async()=>{
 for(const token of [undefined,'short']){
  const env={FORGE_EVENT_URL:url,FORGE_INTEGRATION_SECRET:secret,...(token?{API_TOKEN:token}:{})};
  const response=await worker.fetch(request(input),env);
  assert.equal(response.status,503);
  assert.match((await response.json()).error,/not configured/);
 }
});
test('Forge Worker forwarding rejects missing or invalid private API token',async()=>{
 const env={API_TOKEN:'t'.repeat(64),FORGE_EVENT_URL:url,FORGE_INTEGRATION_SECRET:secret};
 for(const provided of [undefined,'incorrect']){
  const response=await worker.fetch(request(input,provided),env);
  assert.equal(response.status,401);
 }
});
test('Forge Worker signs consented events and reuses caller event ID for safe retries',async()=>{
 const token='t'.repeat(64),env={API_TOKEN:token,FORGE_EVENT_URL:url,FORGE_INTEGRATION_SECRET:secret};
 const oldFetch=globalThis.fetch;
 const received=[];
 globalThis.fetch=async(destination,init)=>{
  assert.equal(String(destination),url);
  assert.equal(init.method,'POST');
  const timestamp=init.headers['x-forge-timestamp'];
  const signature=createHmac('sha256',secret).update(timestamp+'.'+init.body).digest('hex');
  assert.equal(init.headers['x-forge-signature'],signature);
  const event=JSON.parse(init.body);
  received.push(event);
  assert.equal(event.eventId,eventId);
  assert.equal(event.tenantId,tenantId);
  assert.equal(event.source,'leadflow');
  assert.equal(event.consent,true);
  return new Response(JSON.stringify({accepted:true,duplicate:received.length>1}),{status:202});
 };
 try{
  const body={...input,eventId};
  const a=await worker.fetch(request(body,token),env);
  const b=await worker.fetch(request(body,token),env);
  assert.equal(a.status,202);assert.equal(b.status,202);
  assert.equal(received.length,2);assert.deepEqual(received[0],received[1]);
 }finally{globalThis.fetch=oldFetch}
});
test('invalid tenant and event identifiers never reach the signed destination',async()=>{
 const token='t'.repeat(64),env={API_TOKEN:token,FORGE_EVENT_URL:url,FORGE_INTEGRATION_SECRET:secret};
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>{throw Error('Should not send an invalid signed event')};
 try{
  for(const body of [{...input,tenantId:'another-tenant'},{...input,eventId:'invalid-uuid'},{...input,businessName:' '},{...input,consent:false}]){
   const result=await worker.fetch(request(body,token),env);
   assert.equal(result.status,400);
  }
 }finally{globalThis.fetch=oldFetch}
});
