import test from 'node:test';
import assert from 'node:assert/strict';
import {extractPublicContacts,mergePublicContactEvidence,discoverContactPages} from '../contact-evidence.js';
const website='https://ridgeworks.com/';
const home="<!doctype html>\n<nav><a href=\"/about/leadership/\">Meet leadership</a><a href=\"/contact-us/\">Contact us</a>\n<a href=\"https://another-business.com/team\">Other team</a>\n<a href=\"/checkout\">Store</a><a href=\"javascript:alert(1)\">Bad link</a></nav>\n<a href=\"mailto:sales@ridgeworks.com?subject=Hello\">Email sales</a>\n<a href=\"tel:+1-202-555-0141\">Call us</a>\n<a href=\"https://www.linkedin.com/company/ridgeworks/\">Our LinkedIn</a>\n<p>More information: hello [at] ridgeworks [dot] com</p>\n<script>const error=\"monitor@example.com\";</script>\n<script type=\"application/ld+json\">\n{\"@context\":\"https://schema.org\",\"@type\":\"Organization\",\"url\":\"https://ridgeworks.com/\",\n \"email\":\"info@ridgeworks.com\",\"telephone\":\"+1 (202) 555-0188\",\n \"founder\":{\"@type\":\"Person\",\"name\":\"Robin Sanchez\",\"email\":\"robin@ridgeworks.com\"},\n \"contactPoint\":{\"@type\":\"ContactPoint\",\"contactType\":\"sales\",\"email\":\"sales@ridgeworks.com\"},\n \"sameAs\":[\"https://www.facebook.com/ridgeworks/\"]}\n</script>";
test('finds explicitly published company, named owner, mailto and obfuscated business contact addresses',()=>{
 const x=extractPublicContacts(home,website);
 assert.ok(x.emails.includes('robin@ridgeworks.com'));
 assert.ok(x.emails.includes('sales@ridgeworks.com'));
 assert.ok(x.emails.includes('info@ridgeworks.com'));
 assert.ok(x.emails.includes('hello@ridgeworks.com'));
 assert.equal(x.emails.includes('monitor@example.com'),false);
 assert.ok(x.emailEvidence.some(v=>v.email==='robin@ridgeworks.com'&&v.person==='Robin Sanchez'&&v.role==='Founder'&&v.method==='named_company_jsonld'));
 assert.ok(x.phones.some(v=>v.includes('202-555-0141')));
 assert.ok(x.socials.some(v=>v.includes('linkedin.com/company/ridgeworks/')));
 assert.ok(x.socials.some(v=>v.includes('facebook.com/ridgeworks/')));
});
test('prefers named contact evidence, then company-domain mailboxes; never guesses ownership from the address string',()=>{
 const first=extractPublicContacts(home,website);
 const contact=extractPublicContacts('<a href="mailto:external@consultant.org">External</a><p>Contact robin@ridgeworks.com for estimates</p>',website+'contact');
 const merged=mergePublicContactEvidence([{url:website,...first},{url:website+'contact',...contact}],website);
 assert.equal(merged.emailEvidence[0].email,'robin@ridgeworks.com');
 assert.equal(merged.emailEvidence[0].person,'Robin Sanchez');
 assert.equal(merged.emailEvidence[0].classification,'named_company_published');
 assert.equal(merged.emailEvidence[0].sourceCount,2);
 assert.equal(merged.emailEvidence.find(v=>v.email==='external@consultant.org').classification,'external_domain_published');
 assert.equal(merged.namedContacts[0].name,'Robin Sanchez');
 assert.ok(merged.emailEvidence.every(v=>v.note.includes('not independently verified')));
});
test('embedded unrelated organization schema cannot impersonate the audited company',()=>{
 const x=extractPublicContacts('<script type="application/ld+json">'+JSON.stringify({'@type':'Organization',url:'https://other-business.com',founder:{name:'Taylor James',email:'taylor@other-business.com'},email:'info@other-business.com'})+'</script>',website);
 assert.deepEqual(x.emails,[]);
 assert.deepEqual(x.namedContacts,[]);
});
test('contact navigation discovery follows same-host site paths only, with a small budget',()=>{
 const links=discoverContactPages(home,website,3);
 assert.ok(links.includes('/about/leadership'));
 assert.ok(links.includes('/contact-us'));
 assert.equal(links.some(x=>x.includes('checkout')),false);
 assert.equal(links.some(x=>x.includes('other-business')),false);
 assert.ok(links.length<=3);
});
test('rejects unobserved, invalid or executable contact strings',()=>{
 const x=extractPublicContacts('<a href="mailto:somebody@example.org">Test</a><a href="mailto:noreply@ridgeworks.com">No reply</a><script>owner@ridgeworks.com</script>',website);
 assert.deepEqual(x.emails,[]);
 assert.deepEqual(extractPublicContacts('',website).emails,[]);
});
test('merge refuses cross-domain evidence injection',()=>{
 const x=mergePublicContactEvidence([{url:'https://another-business.com/contact',...extractPublicContacts('<a href="mailto:info@another-business.com">mail</a>','https://another-business.com/contact')}],website);
 assert.deepEqual(x.emails,[]);
});
test('nested relative contact links resolve against the retrieved document URL',()=>{
 assert.deepEqual(discoverContactPages('<a href="team">Team</a><a href="../contact">Contact</a><a href="https://another-business.com/team">Other</a>',website+'about/',4),['/contact','/about/team']);
});


test('hidden mailto links, business emails, phone numbers and social URLs are not contact evidence',()=>{
 const hidden= [
  '<template><a href="mailto:private@ridgeworks.com">Email private</a></template>',
  '<div hidden><p>invisible@ridgeworks.com</p><a href="tel:+1-202-555-0123">Call</a></div>',
  '<section inert><a href="https://linkedin.com/company/private-team">LinkedIn</a></section>',
  '<div aria-hidden="true"><a href="mailto:concealed@ridgeworks.com">Concealed</a></div>',
  '<section style="display : none"><p>no-show@ridgeworks.com</p></section>',
  '<aside style="visibility:hidden!important"><a href="tel:+1-202-555-0124">Phone</a></aside>',
  '<script>const owner="script@ridgeworks.com";</script>',
  '<noscript><a href="mailto:noscript@ridgeworks.com">Mail</a></noscript>',
  '<!-- <a href="mailto:comment@ridgeworks.com">Comment</a> -->',
 ].join('');
 const visible='<main><a href="mailto:info@ridgeworks.com">Email the office</a>'+
  '<a href="https://linkedin.com/company/ridgeworks">Our LinkedIn</a></main>';
 const result=extractPublicContacts(hidden+visible,website);
 assert.deepEqual(result.emails,['info@ridgeworks.com']);
 assert.deepEqual(result.phones,[]);
 assert.equal(result.socials.length,1);
 assert.ok(result.socials[0].includes('ridgeworks'));
 assert.ok(result.emailEvidence.every(row=>row.method==='mailto_link'));
});

test('hidden discovery links cannot trigger unseen leadership or contact page research',()=>{
 const html='<nav><a href="/contact">Contact</a></nav>'+
  '<template><a href="/leadership">Leaders</a></template>'+
  '<section hidden><a href="/owner">Owner</a></section>'+
  '<div style="display:none"><a href="/team">Team</a></div>'+
  '<div aria-hidden="true"><a href="/about">About</a></div>'+
  '<a href="/staff">Published Staff</a>';
 assert.deepEqual(discoverContactPages(html,website,8),['/contact','/staff']);
});

test('organization structured data remains usable even though scripts are not rendered text',()=>{
 const schema=JSON.stringify({
  '@context':'https://schema.org','@type':'Organization',url:website,
  founder:{'@type':'Person',name:'Taylor Rivers',email:'taylor@ridgeworks.com'},
  email:'support@ridgeworks.com'
 });
 const html='<script type="application/ld+json">'+schema+'</script>'+
  '<main><h1>Ridgeworks Team</h1></main>';
 const result=extractPublicContacts(html,website);
 assert.ok(result.emails.includes('taylor@ridgeworks.com'));
 assert.ok(result.emails.includes('support@ridgeworks.com'));
 assert.equal(result.namedContacts[0].name,'Taylor Rivers');
});
