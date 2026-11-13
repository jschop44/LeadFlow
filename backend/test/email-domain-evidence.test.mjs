import test from 'node:test';
import assert from 'node:assert/strict';
import {createMailDomainInspector,applyMailDomainEvidence} from '../email-domain-evidence.js';

test('public MX records indicate only domain mail-routing capability, not address deliverability',async()=>{
 let calls=0;
 const lookup=createMailDomainInspector({resolver:{resolveMx:async host=>{calls++;assert.equal(host,'ridgeworks.com');return [{exchange:'mail.ridgeworks.com',priority:10}]}},now:()=>0});
 const evidence=await lookup(['sales@ridgeworks.com','team@ridgeworks.com']);
 assert.equal(calls,1);
 assert.equal(evidence['ridgeworks.com'].status,'mx_present');
 assert.match(evidence['ridgeworks.com'].description,/does not establish mailbox/);
 evidence['ridgeworks.com'].status='tampered';
 assert.equal((await lookup(['sales@ridgeworks.com']))['ridgeworks.com'].status,'mx_present');
 assert.equal(calls,1);
});
test('explicit RFC null MX is a distinct no-mail signal and moves behind other published email evidence',async()=>{
 const inspect=createMailDomainInspector({resolver:{resolveMx:async domain=>domain==='nomail.org'?[{exchange:'.',priority:0}]:[{exchange:'mx.mail.net',priority:10}]}});
 const domains=await inspect(['info@nomail.org','hello@business.com']);
 assert.equal(domains['nomail.org'].status,'null_mx');
 const items=applyMailDomainEvidence([{email:'info@nomail.org',source:'https://nomail.org/contact'},{email:'hello@business.com',source:'https://business.com/contact'}],domains);
 assert.equal(items[0].email,'hello@business.com');
 assert.equal(items[1].mailDomain.status,'null_mx');
});
test('MX absence is not mistaken for a definitively invalid mailbox',async()=>{
 const inspector=createMailDomainInspector({resolver:{resolveMx:async()=>{throw Object.assign(new Error('No MX'),{code:'ENODATA'})}}});
 const result=await inspector(['contact@business.example']);
 assert.equal(result['business.example'].status,'no_mx_observed');
 assert.match(result['business.example'].description,/fallback/);
});
test('nonexistent email domain is flagged, unknown DNS outage does not invent a negative result',async()=>{
 const resolver={resolveMx:async host=>{throw Object.assign(new Error('fail'),{code:host==='missing.org'?'ENOTFOUND':'ECONNREFUSED'})}};
 const inspector=createMailDomainInspector({resolver});
 const rows=await inspector(['sales@missing.org','team@outage.org']);
 assert.equal(rows['missing.org'].status,'domain_not_found');
 assert.equal(rows['outage.org'].status,'dns_unavailable');
});
test('caps unique remote domains, concurrent DNS calls, and rejects invalid contact strings',async()=>{
 let active=0,peak=0,calls=0;
 const inspector=createMailDomainInspector({maxDomains:4,maxConcurrent:2,resolver:{resolveMx:async domain=>{
  calls++;peak=Math.max(peak,++active);await new Promise(resolve=>setImmediate(resolve));active--;return [{exchange:'mx.'+domain,priority:0}];
 }}});
 const result=await inspector(['fake','not-an-email','a@one.com','b@two.com','c@three.com','d@four.com','e@five.com']);
 assert.equal(calls,4);
 assert.ok(peak<=2);
 assert.equal(Object.keys(result).length,4);
});
