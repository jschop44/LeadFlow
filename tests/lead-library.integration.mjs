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
