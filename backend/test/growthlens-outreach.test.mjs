import test from 'node:test';
import assert from 'node:assert/strict';
import {auditOpportunity,personalizedDraft} from '../growthlens-outreach.js';
test('uses only failed audit findings with explicit source',()=>{
 const o=auditOpportunity({url:'https://example.com',score:62,findings:[{id:'contact',name:'Contact links',passed:false},{id:'navigation',name:'Navigation',passed:true}]},'Website improvement');
 assert.equal(o.verified,true);assert.equal(o.id,'contact');assert.equal(o.source,'https://example.com');
 const d=personalizedDraft({business:'Example Co',service:'Website improvement',sender:'Agency, 1 Main St',unsubscribe:'Reply unsubscribe'},o);
 assert.match(d.text,/Contact links/i);assert.equal(d.sendingEnabled,false);
});
test('does not invent issues when no verified findings exist',()=>{
 const o=auditOpportunity({findings:[{id:'contact',passed:true}]},'Web design');
 assert.equal(o.verified,false);
 const d=personalizedDraft({business:'Example Co',service:'Web design',sender:'Agency',unsubscribe:'Reply unsubscribe'},o);
 assert.match(d.text,/have not verified a specific issue/);
});

test('email and DM include business context and the audited next step without financial claims',()=>{
 const o=auditOpportunity({url:'https://example.com',findings:[{id:'conversion_cta',name:'Clear conversion action',passed:false,recommendation:'Link the appointment button to the booking page.'}]},'Web design');
 const d=personalizedDraft({business:'Harbor Dental',niche:'Dental clinic',location:'Baltimore',service:'Web design',sender:'Sam, Agency',unsubscribe:'Reply stop'},o);
 assert.match(d.text,/Dental clinic in Baltimore/);assert.match(d.text,/appointment button/);
 assert.match(d.socialText,/Harbor Dental/);assert.match(d.socialText,/appointment button/);assert.match(d.socialText,/Reply stop/);
 assert.equal(d.sendingEnabled,false);assert.doesNotMatch(d.text,/guarantee|\$\d/);
});
test('finding identifier substrings do not create false verified findings',()=>{
 assert.equal(auditOpportunity({url:'https://example.com',findings:[{id:'not_contact_verified',passed:false}]}).verified,false);
 assert.equal(auditOpportunity({findings:[{id:'contact',passed:false}]}).verified,false);
});
test('observed insecure forms take precedence in both outreach drafts, with the actual fix',()=>{
 const opportunity=auditOpportunity({url:'https://clinic.example',findings:[
  {id:'contact',name:'Contact path',passed:false},
  {id:'secure_forms',name:'Secure form destinations',passed:false,recommendation:'Change the appointment form action to your approved HTTPS booking endpoint.'}
 ]},'Website improvement');
 assert.equal(opportunity.id,'secure_forms');
 const draft=personalizedDraft({business:'Harbor Clinic',service:'Website improvement',sender:'Sam',unsubscribe:'Reply stop'},opportunity);
 assert.match(draft.text,/approved HTTPS booking endpoint/);
 assert.match(draft.socialText,/approved HTTPS booking endpoint/);
 assert.doesNotMatch(draft.text,/breach|guarantee|\$\d/i);
});
import {createAuditCache} from '../growthlens-outreach.js';
test('simultaneous email and DM share one audit, reuse results, expire and evict',async()=>{
 let calls=0,clock=0;const cached=createAuditCache(async()=>{calls++;return {status:'completed',findings:[]};},{now:()=>clock,ttlMs:10,maxEntries:1});
 await Promise.all([cached('https://one.example/a'),cached('https://one.example/b')]);assert.equal(calls,1);
 await cached('https://one.example');assert.equal(calls,1);
 clock=11;await cached('https://one.example');assert.equal(calls,2);
 await cached('https://two.example');await cached('https://one.example');assert.equal(calls,4);
});
test('failed and incomplete audits can be retried',async()=>{
 let calls=0;const cached=createAuditCache(async()=>{calls++;if(calls===1)throw Error('offline');return {status:calls===2?'partial':'completed'};});
 await assert.rejects(cached('https://example.com'),/offline/);await cached('https://example.com');await cached('https://example.com');await cached('https://example.com');assert.equal(calls,3);
});
test('distinct concurrent audits are bounded while duplicate requests still coalesce',async()=>{
 let release;const wait=new Promise(resolve=>{release=resolve;});
 const cached=createAuditCache(async()=>{await wait;return {status:'completed'};});
 const jobs=Array.from({length:10},(_,i)=>cached('https://site'+i+'.example'));
 const duplicate=cached('https://site0.example');await assert.rejects(cached('https://overflow.example'),/capacity/);
 release();await Promise.all([...jobs,duplicate]);
});
