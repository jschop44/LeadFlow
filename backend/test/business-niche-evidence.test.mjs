import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {financialAdvisorEvidence} from '../business-niche-evidence.js';
import {matchesIndexedNiche} from '../regional-index.js';
import {supportsCatalogNiche} from '../catalog-niche-evidence.js';

test('real Maryland financial advisor search excludes health, mortgage and accounting false positives',()=>{
 const snapshot=JSON.parse(readFileSync(new URL('../data/maryland-businesses.json',import.meta.url),'utf8'));
 const rows=snapshot.records.filter(row=>row.tags?.['addr:city']==='Bel Air'&&row.niches?.includes('Financial advisors'));
 const accepted=rows.filter(row=>matchesIndexedNiche(row,'Financial advisors'));
 const names=accepted.map(row=>row.tags.name);
 assert.ok(rows.length>=40,'Representative source coverage missing');
 assert.ok(accepted.length>=10,'Advisory evidence must retain useful real results');
 for(const bad of ["Children's Heart Institute",'IQL Behavioral Health Services','Barwick CPA','Crosscountry Mortgage','Fairway Independent Mortgage Corporation']){
  assert.equal(names.includes(bad),false,'Unrelated listing was classified as an advisor: '+bad);
 }
 for(const good of ['RBC Wealth Management','Harford Retirement Planners','Allworth Financial']){
  assert.ok(names.includes(good),'Published adviser listing unexpectedly missing: '+good);
 }
 assert.ok(accepted.length<rows.length,'Broad office category was not narrowed');
});
test('regional and online catalog share one financial advisor evidence policy',()=>{
 const rows=[
  {tags:{name:'Tax CPA',office:'financial'},accepted:false},
  {tags:{name:'Independent Financial Advisors',office:'financial'},accepted:true},
  {tags:{name:'Edward Jones',office:'financial_advisor'},accepted:true},
  {tags:{name:'Mortgage lender',office:'financial'},accepted:false},
  {tags:{name:'RBC Wealth Management',office:'insurance'},accepted:true}
 ];
 for(const {tags,accepted} of rows){
  assert.equal(financialAdvisorEvidence(tags),accepted);
  assert.equal(matchesIndexedNiche({tags,niches:['Financial advisors']},'Financial advisors'),accepted);
  assert.equal(supportsCatalogNiche({niches:['Financial advisors'],element:{tags}},'Financial advisors'),accepted);
 }
 assert.equal(supportsCatalogNiche({niches:['Insurance agencies'],element:{tags:{name:'RBC Wealth Management'}}},'Financial advisors'),false);
});
