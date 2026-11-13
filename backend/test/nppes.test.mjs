import test from 'node:test';
import assert from 'node:assert/strict';
import {nppesQuery,isHealthcareNiche,createNppesLookup} from '../integrations/nppes.js';
const sample={number:'1234567890',enumeration_type:'NPI-2',basic:{organization_name:'Harbor Dental Group LLC',
 status:'A',authorized_official_first_name:'Taylor',authorized_official_last_name:'Morgan',
 authorized_official_title_or_position:'Practice Administrator',last_updated:'2026-10-10'},
 addresses:[{address_purpose:'MAILING',address_1:'Never expose private mailing address',city:'Elsewhere',state:'MD',
 telephone_number:'202-555-0158'},{address_purpose:'LOCATION',address_1:'Never expose full practice address',
 city:'Baltimore',state:'MD',telephone_number:'410-555-0132'}],
 taxonomies:[{desc:'Dental Clinic',code:'261QD0000X',primary:true}]};
test('NPPES only accepts healthcare business niches and builds a bounded organization-only query',()=>{
 assert.equal(isHealthcareNiche('Dental practices'),true);
 assert.equal(isHealthcareNiche('Financial advisors'),false);
 const q=nppesQuery({name:'Harbor Dental Group LLC',state:'MD',city:'Baltimore'}).url;
 assert.equal(q.origin,'https://npiregistry.cms.hhs.gov');
 assert.equal(q.searchParams.get('version'),'2.1');
 assert.equal(q.searchParams.get('enumeration_type'),'NPI-2');
 assert.equal(q.searchParams.get('limit'),'20');
 assert.equal(q.searchParams.get('state'),'MD');
 assert.equal(q.searchParams.get('city'),'Baltimore');
 assert.throws(()=>nppesQuery({name:'A'}),/specific healthcare/);
 assert.throws(()=>nppesQuery({name:'A modern company',state:'ZZ'}),/valid two-letter/);
});
test('returns exact matched organization NPI with public location phone, taxonomy and labeled authorized official',async()=>{
 let calls=0;
 const lookup=createNppesLookup({now:()=>Date.parse('2026-11-13T10:00:00Z'),fetcher:async raw=>{
  calls++;const u=new URL(raw);assert.equal(u.searchParams.get('enumeration_type'),'NPI-2');
  return Response.json({result_count:1,results:[sample]});
 }});
 const result=await lookup({name:'Harbor Dental Group LLC',state:'MD',city:'Baltimore',niche:'Dental practices'});
 assert.equal(result.status,'possible_organization_matches');assert.equal(result.matches.length,1);
 const match=result.matches[0];
 assert.equal(match.npi,'1234567890');
 assert.equal(match.practicePhone,'410-555-0132');
 assert.equal(match.specialties[0].description,'Dental Clinic');
 assert.equal(match.authorizedOfficial.name,'Taylor Morgan');
 assert.equal(match.authorizedOfficial.verifiedOwner,false);
 assert.match(match.authorizedOfficial.role,/not necessarily/);
 assert.equal(match.source,'https://npiregistry.cms.hhs.gov/api/?version=2.1&number=1234567890');
 assert.equal(JSON.stringify(result).includes('Never expose'),false);
 await lookup({name:'Harbor Dental Group LLC',state:'MD',city:'Baltimore',niche:'Dental practices'});
 assert.equal(calls,1);
});
test('rejects individual clinicians, mismatched organization names, other-state addresses and deactivated records',async()=>{
 const rows=[{...sample,enumeration_type:'NPI-1',number:'1111111111'},
 {...sample,number:'2222222222',basic:{...sample.basic,organization_name:'Different Dental Clinic'}},
 {...sample,number:'3333333333',addresses:[{address_purpose:'LOCATION',city:'Denver',state:'CO'}]},
 {...sample,number:'4444444444',basic:{...sample.basic,status:'D'}}];
 const lookup=createNppesLookup({fetcher:async()=>Response.json({result_count:4,results:rows})});
 const result=await lookup({name:'Harbor Dental Group LLC',state:'MD',city:'Baltimore',niche:'Dental practices'});
 assert.equal(result.status,'no_exact_organization_match');assert.equal(result.matches.length,0);
});
test('rejects unauthorized niche and malformed CMS payload without claiming empty matches',async()=>{
 const lookup=createNppesLookup({fetcher:async()=>Response.json({Errors:[{field:'organization_name',description:'rate limited'}],results:[]})});
 await assert.rejects(lookup({name:'Business Advisors LLC',niche:'Financial advisors'}),/healthcare/);
 await assert.rejects(lookup({name:'Harbor Dental Group LLC',niche:'Dental practices'}),/unavailable/);
});
test('deduplicates simultaneous CMS queries while giving independent caller values',async()=>{
 let calls=0;
 const lookup=createNppesLookup({fetcher:async()=>{calls++;await new Promise(setImmediate);return Response.json({result_count:1,results:[sample]})}});
 const p={name:'Harbor Dental Group LLC',state:'MD',niche:'Dental practices'};
 const [a,b]=await Promise.all([lookup(p),lookup(p)]);
 assert.equal(calls,1);
 a.matches[0].legalName='Changed';assert.equal(b.matches[0].legalName,'Harbor Dental Group LLC');
});

test('exact CMS published DBA is associated with its distinct legal name, never invented owner',async()=>{
 const published={...sample,basic:{...sample.basic,organization_name:'Harbor Healthcare Holdings LLC'},
  other_names:[{organization_name:'Harbor Dental Group LLC',type:'Doing Business As'}]};
 const lookup=createNppesLookup({fetcher:async()=>Response.json({result_count:1,results:[published]})});
 const result=await lookup({name:'Harbor Dental Group LLC',state:'MD',city:'Baltimore',niche:'Dental practices'});
 assert.equal(result.matches.length,1);
 assert.equal(result.matches[0].legalName,'Harbor Healthcare Holdings LLC');
 assert.equal(result.matches[0].matching.nameUsed,'Harbor Dental Group LLC');
 assert.equal(result.matches[0].matching.organizationName,'exact_registered_dba');
 assert.equal(result.matches[0].authorizedOfficial.verifiedOwner,false);
});
test('former legal names are NOT considered proof of a currently operating trade name',async()=>{
 const prior={...sample,basic:{...sample.basic,organization_name:'New Current Business LLC'},
  other_names:[{organization_name:'Harbor Dental Group LLC',type:'Former Legal Business Name'}]};
 const lookup=createNppesLookup({fetcher:async()=>Response.json({result_count:1,results:[prior]})});
 const result=await lookup({name:'Harbor Dental Group LLC',state:'MD',city:'Baltimore',niche:'Dental practices'});
 assert.equal(result.status,'no_exact_organization_match');
});
test('exact registered other names are labeled as current-use unknown, not legal-name proof',async()=>{
 const registered={...sample,basic:{...sample.basic,organization_name:'Regional Dental Associates LLC'},
  other_names:[{organization_name:'Harbor Dental Group LLC',type:'Other Name'}]};
 const lookup=createNppesLookup({fetcher:async()=>Response.json({result_count:1,results:[registered]})});
 const result=await lookup({name:'Harbor Dental Group LLC',state:'MD',city:'Baltimore',niche:'Dental practices'});
 assert.equal(result.matches[0].matching.organizationName,'exact_registered_other_name');
 assert.equal(result.matches[0].matching.nameCurrentStatus,'current_use_unknown');
});
test('published additional practice site can match a specific city without returning full addresses',async()=>{
 const multi={...sample,addresses:[{address_purpose:'LOCATION',city:'Frederick',state:'MD',telephone_number:'301-555-0141'}],
  practiceLocations:[{address_1:'Not included in result',city:'Baltimore',state:'MD',telephone_number:'410-555-0132'}]};
 const lookup=createNppesLookup({fetcher:async()=>Response.json({result_count:1,results:[multi]})});
 const result=await lookup({name:'Harbor Dental Group LLC',state:'MD',city:'Baltimore',niche:'Dental practices'});
 assert.equal(result.matches.length,1);
 assert.equal(result.matches[0].matching.practiceSource,'additional_practice');
 assert.equal(result.matches[0].practicePhone,'410-555-0132');
 assert.equal(JSON.stringify(result).includes('Not included in result'),false);
});
test('similar but not exact registered names remain unmatched',async()=>{
 const provider={...sample,basic:{...sample.basic,organization_name:'Harbor Dental Group International LLC'},
  other_names:[{organization_name:'Harbor Dental Group Inc',type:'Doing Business As'}]};
 const lookup=createNppesLookup({fetcher:async()=>Response.json({result_count:1,results:[provider]})});
 const result=await lookup({name:'Harbor Dental Group LLC',state:'MD',city:'Baltimore',niche:'Dental practices'});
 assert.equal(result.matches.length,0);
});
