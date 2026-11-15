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

test('named leadership cannot be injected without matching published company schema evidence',()=>{
 const website='https://ridgeworks.com/';
 const forged={url:website,namedContacts:[{name:'Robin Sanchez',role:'CEO',email:'robin@ridgeworks.com',source:website}],
  emailEvidence:[{email:'robin@ridgeworks.com',method:'mailto_link',source:website}]};
 const absent=mergePublicContactEvidence([forged],website);
 assert.deepEqual(absent.namedContacts,[],'a mailto does not establish a named CEO');
 assert.equal(absent.emailEvidence[0].classification,'company_domain_published');
 const mixed={...forged,emailEvidence:[
  {email:'someone@ridgeworks.com',method:'named_company_jsonld',person:'Robin Sanchez',role:'CEO',source:website}
 ]};
 assert.deepEqual(mergePublicContactEvidence([mixed],website).namedContacts,[],
  'an unrelated email must not support the leadership association');
});

test('matching named company structured-data evidence is retained and normalized',()=>{
 const website='https://ridgeworks.com/';
 const page=extractPublicContacts('<script type="application/ld+json">'+JSON.stringify({
  '@type':'Organization',url:website,
  founder:{'@type':'Person',name:'Jordan Brooks',email:'jordan@ridgeworks.com'},
 })+'</script>',website);
 const merged=mergePublicContactEvidence([{url:website,...page}],website);
 assert.equal(merged.namedContacts.length,1);
 assert.equal(merged.namedContacts[0].name,'Jordan Brooks');
 assert.equal(merged.namedContacts[0].email,'jordan@ridgeworks.com');
 assert.equal(merged.emailEvidence[0].classification,'named_company_published');
});


test('published social share buttons and individual media are not business profile evidence',()=>{
 const html=[
  '<a href="https://www.linkedin.com/sharing/share-offsite/?url=https://ridgeworks.com/">Share</a>',
  '<a href="https://www.facebook.com/sharer/sharer.php?u=https://ridgeworks.com">Share</a>',
  '<a href="https://x.com/intent/tweet?text=our-company">Tweet</a>',
  '<a href="https://www.youtube.com/watch?v=123456">Watch</a>',
  '<a href="https://www.instagram.com/p/ABCDEFGHIJ/">Post</a>',
  '<a href="https://www.tiktok.com/t/ABC123">Share</a>',
  '<a href="https://www.linkedin.com/login">Login</a>',
  '<a href="https://www.linkedin.com/company/ridgeworks/">Our LinkedIn</a>',
  '<a href="https://www.facebook.com/ridgeworks/">Our Facebook</a>',
  '<a href="https://www.instagram.com/ridgeworks/">Our Instagram</a>',
  '<a href="https://www.youtube.com/@ridgeworks">Our YouTube</a>',
  '<a href="https://www.tiktok.com/@ridgeworks">Our TikTok</a>',
 ].join('');
 const result=extractPublicContacts(html,website);
 assert.equal(result.socials.length,5,'only five account/profile URLs are retained');
 assert.ok(result.socials.some(x=>x.includes('/company/ridgeworks/')));
 assert.ok(result.socials.some(x=>x.includes('/@ridgeworks')));
 assert.ok(result.socials.every(x=>!/(?:\/sharer|\/intent|\/watch|\/p\/|\/t\/|\/login)/.test(x)));
});

test('social URLs from company schema cannot inflate contact evidence with share links',()=>{
 const schema=JSON.stringify({'@type':'Organization',url:website,sameAs:[
  'https://facebook.com/sharer.php?u=https://ridgeworks.com/',
  'https://www.linkedin.com/company/ridgeworks/',
  'https://www.youtube.com/watch?v=123',
  'https://www.instagram.com/ridgeworks/',
 ]});
 const parsed=extractPublicContacts('<script type="application/ld+json">'+schema+'</script>',website);
 assert.deepEqual(parsed.socials,[
  'https://www.linkedin.com/company/ridgeworks/',
  'https://www.instagram.com/ridgeworks/',
 ]);
 const merged=mergePublicContactEvidence([{url:website,...parsed}],website);
 assert.deepEqual(merged.socials,parsed.socials);
});

test('nested account posts and videos are not elevated to business social profiles',()=>{
 const posts=[
  'https://x.com/ridgeworks/status/123456',
  'https://twitter.com/ridgeworks/status/123456',
  'https://www.facebook.com/ridgeworks/posts/123456',
  'https://www.instagram.com/ridgeworks/reel/ABC123',
  'https://www.instagram.com/ridgeworks/p/ABC123',
  'https://www.linkedin.com/company/ridgeworks/posts/123456',
  'https://www.youtube.com/@ridgeworks/shorts',
  'https://www.youtube.com/channel/UC123/videos',
  'https://www.tiktok.com/@ridgeworks/video/123456'
 ];
 const profiles=[
  'https://x.com/ridgeworks',
  'https://www.facebook.com/ridgeworks/',
  'https://www.instagram.com/ridgeworks/',
  'https://www.linkedin.com/company/ridgeworks/',
  'https://www.youtube.com/@ridgeworks',
  'https://www.youtube.com/channel/UC123',
  'https://www.tiktok.com/@ridgeworks'
 ];
 const page=posts.concat(profiles).map(url=>'<a href="'+url+'">Published social link</a>').join('');
 const result=extractPublicContacts(page,website);
 assert.deepEqual(result.socials,profiles);
 assert.equal(result.socials.some(s=>posts.includes(s)),false);
});

test('nested post URLs in published Organization sameAs never become company account evidence',()=>{
 const sameAs=[
  'https://x.com/ridgeworks/status/123456',
  'https://www.linkedin.com/company/ridgeworks/posts/123',
  'https://www.facebook.com/ridgeworks/',
 ];
 const schema=JSON.stringify({'@type':'Organization',url:website,sameAs});
 const result=extractPublicContacts('<script type="application/ld+json">'+schema+'</script>',website);
 assert.deepEqual(result.socials,['https://www.facebook.com/ridgeworks/']);
});
