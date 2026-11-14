import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initLeadLibrary,libraryAction} from '../backend/lead-library.js';

if(!process.env.DATABASE_URL){console.error('DATABASE_URL is required. Run only against an authorized test database.');process.exit(2)}
const ready=await initLeadLibrary();
assert.equal(ready,true,'Neon connection failed');
const token='leadflow-integration-'+randomUUID();
const website='https://integration-'+randomUUID()+'.example';
const lead={name:'LeadFlow integration test business',website,niche:'integration-test',address:'Test fixture'};
const firstBrowser=async(action,options={})=>libraryAction(token,action,options);
const secondBrowser=async(action,options={})=>libraryAction(token,action,options);
const otherUser=async(action,options={})=>libraryAction('different-'+token,action,options);
await firstBrowser('upsert',{leads:[lead]});
assert.equal((await secondBrowser('list',{filter:'new'})).leads.some(x=>x.website===website),true,'New lead missing on second session');
await firstBrowser('upsert',{leads:[{...lead,seen:true,saved:true}],updateSaved:true});
assert.equal((await secondBrowser('list',{filter:'saved'})).leads.some(x=>x.website===website&&x.saved),true,'Saved lead missing on second session');
assert.equal((await secondBrowser('list',{filter:'seen'})).leads.some(x=>x.website===website),true,'Previously found lead missing');
// A follow-up discovery often lacks the public contacts found on a previous visit.
const rich={...lead,owner:'Taylor Brooks',email:'hello@integration.example',phone:'202-555-0144',socials:['https://www.linkedin.com/company/leadflow-fixture'],source:'Published company contact page'};
await firstBrowser('upsert',{leads:[rich]});
await secondBrowser('upsert',{leads:[{...lead,owner:'',email:'',phone:'',socials:[],source:'',seen:true}]});
let preserved=(await firstBrowser('list',{filter:'all'})).leads.find(x=>x.website===website);
for(const field of ['owner','email','phone','source'])assert.equal(preserved[field],rich[field],'Sparse rediscovery erased '+field);
assert.deepEqual(preserved.socials,rich.socials,'Sparse rediscovery erased verified social links');
await secondBrowser('upsert',{leads:[{...lead,phone:'202-555-0191'}]});
preserved=(await firstBrowser('list',{filter:'all'})).leads.find(x=>x.website===website);
assert.equal(preserved.phone,'202-555-0191','A newer nonempty verified phone must update');
assert.equal(preserved.owner,rich.owner,'Updating a phone must not clear the public contact');

const membership=await secondBrowser('check-seen',{leads:[lead,{...lead,name:'Different firm',website:'https://other.example'}]});
assert.deepEqual(membership.seenKeys,['domain:'+new URL(website).hostname], 'Second device must see exact previously shown membership');
assert.deepEqual((await otherUser('check-seen',{leads:[lead]})).seenKeys,[], 'Seen evidence must remain isolated by API token');
await assert.rejects(secondBrowser('check-seen',{leads:Array.from({length:101},()=>lead)}),/at most 100/i);

await secondBrowser('upsert',{leads:[{...lead,seen:true,saved:false}]});
assert.equal((await firstBrowser('list',{filter:'saved'})).leads.some(x=>x.website===website),true,'Background discovery cleared Saved');
await secondBrowser('upsert',{leads:[{...lead,seen:true,saved:false}],updateSaved:true});
assert.equal((await firstBrowser('list',{filter:'saved'})).leads.some(x=>x.website===website),false,'Unsave failed');
assert.equal((await firstBrowser('list',{filter:'all'})).leads.some(x=>x.website===website&&!x.saved),true,'Unsaved lead missing from archive');
assert.equal((await otherUser('list',{filter:'all'})).leads.some(x=>x.website===website),false,'Lead leaked into another token scope');
console.log('PASS: new -> save -> second session retrieval -> background sync -> unsave -> persistent archive -> token isolation');
