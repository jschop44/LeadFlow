import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function isolatedFunction(startToken,endToken,scope={}){
 const start=html.indexOf(startToken),end=html.indexOf(endToken,start+startToken.length);
 assert.ok(start>=0&&end>start,'Expected browser contact function in source');
 const context=vm.createContext(scope);
 new vm.Script(html.slice(start,end)).runInContext(context);
 return context;
}
const {preferredLeadContact}=isolatedFunction('function preferredLeadContact(lead){','function contactCell(x){');
const {knownBadRecipientDomain}=isolatedFunction('function knownBadRecipientDomain(lead,email){','function updateRecipient(lead){');

test('published named contact takes priority over stale email and owner email from unverified listing',()=>{
 const lead={email:'old@directory.org',ownerEmail:'owner@directory.org',enrichedEmails:['hello@office.com'],
  enrichedEmailEvidence:[{email:'jane@office.com',source:'https://office.com/team',classification:'named_company_published',mailDomain:{status:'mx_present'}},
   {email:'hello@office.com',source:'https://office.com/contact',classification:'company_domain_published',mailDomain:{status:'mx_present'}}]};
 const best=preferredLeadContact(lead);
 assert.equal(best.email,'jane@office.com');
 assert.equal(best.evidence.source,'https://office.com/team');
 assert.equal(best.kind,'company_website');
 assert.equal(best.evidence.mailDomain.status,'mx_present');
});
test('never automatically suggests published or listing contacts at an explicit no-mail domain',()=>{
 const lead={email:'info@nomail.org',ownerEmail:'boss@nomail.org',enrichedEmails:['info@nomail.org'],
  enrichedEmailEvidence:[{email:'info@nomail.org',source:'https://nomail.org/contact',mailDomain:{status:'null_mx'}}]};
 const best=preferredLeadContact(lead);
 assert.equal(best.email,'');
 assert.equal(best.blockedCount,1);
 assert.equal(knownBadRecipientDomain(lead,'sales@nomail.org'),'null_mx');
});
test('when one published address is blocked, another published address beats old source listing',()=>{
 const lead={email:'old@directory.com',enrichedEmails:['admin@invalid.org','hello@working.com'],
  enrichedEmailEvidence:[
   {email:'admin@invalid.org',source:'https://business.com/contact',mailDomain:{status:'domain_not_found'}},
   {email:'hello@working.com',source:'https://business.com/team',mailDomain:{status:'mx_present'}}]};
 const best=preferredLeadContact(lead);
 assert.equal(best.email,'hello@working.com');
 assert.equal(best.blockedCount,1);
 assert.equal(knownBadRecipientDomain(lead,'manager@invalid.org'),'domain_not_found');
 assert.equal(knownBadRecipientDomain(lead,'hello@working.com'),'');
});
test('keeps legacy website email and manual lookup fallback without asserting inbox verification',()=>{
 assert.equal(preferredLeadContact({enrichedEmails:['hello@company.com'],email:'older@listing.org'}).email,'hello@company.com');
 assert.equal(preferredLeadContact({ownerEmail:'owner@listing.org',email:'info@listing.org'}).email,'owner@listing.org');
 assert.equal(preferredLeadContact({email:'info@listing.org'}).kind,'listing_company_unverified');
 assert.equal(preferredLeadContact({email:'invalid address'}).email,'');
 assert.equal(preferredLeadContact(null).email,'');
 assert.equal(preferredLeadContact({email:'team@company.com',enrichedEmailEvidence:[{email:'help@company.com',source:'https://company.com/contact',mailDomain:{status:'dns_unavailable'}}]}).email,'help@company.com');
});
test('frontend contact, outreach and CSV export all derive the preferred recipient from same evidence',()=>{
 assert.match(html,/const chosen=preferredLeadContact\(x\);/);
 assert.match(html,/function updateRecipient\(lead\)\{\s*const chosen=preferredLeadContact\(lead\)/);
 assert.match(html,/k==='email'\?preferredLeadContact\(x\)\.email/);
 assert.match(html,/k==='preferredEmailSource'\?/);
 assert.match(html,/k==='preferredEmailRouting'\?/);
 assert.match(html,/recipientManuallyEdited=true/);
 assert.match(html,/!recipientManuallyEdited\)updateRecipient\(x\)/);
 assert.match(html,/function recipientEmail\(\)\{\s*const email=\$\('manual-recipient'\)\.value\.trim\(\)/);
 assert.match(html,/knownBadRecipientDomain\(selectedDraftLead,to\)/);
});
test('all inline browser script sections remain syntactically valid',()=>{
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
 assert.ok(scripts.length>0);
 for(const [index,s] of scripts.entries())assert.doesNotThrow(()=>new vm.Script(s[1],{filename:'index-script-'+index+'.js'}));
});
