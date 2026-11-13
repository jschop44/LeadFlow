import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {financialAdvisorEvidence,pizzaRestaurantEvidence} from '../business-niche-evidence.js';
import {matchesIndexedNiche} from '../regional-index.js';

test('observed Maryland advisor search excludes categorically unrelated businesses',()=>{
 const snapshot=JSON.parse(readFileSync(new URL('../data/maryland-businesses.json',import.meta.url),'utf8'));
 const area=snapshot.records.filter(row=>row.tags?.['addr:city']==='Bel Air'&&row.niches?.includes('Financial advisors'));
 const accepted=area.filter(row=>matchesIndexedNiche(row,'Financial advisors'));
 const names=accepted.map(row=>row.tags.name);
 assert.ok(area.length>=40,'Expected representative real snapshot coverage');
 assert.ok(accepted.length>=10,'Advisory evidence filter discarded all the usable records');
 for(const bad of ["Children's Heart Institute",'IQL Behavioral Health Services','Barwick CPA','Crosscountry Mortgage','Fairway Independent Mortgage Corporation']){
  assert.equal(names.includes(bad),false,'Unrelated lead was classified as an advisor: '+bad);
 }
 for(const good of ['RBC Wealth Management','Harford Retirement Planners','Allworth Financial']){
  assert.ok(names.includes(good),'Published advisor listing unexpectedly missing: '+good);
 }
 assert.ok(accepted.length<area.length,'Evidence filter is not restricting broad financial-office listings');
});

test('pizza-only local queries require observable cuisine and food business type',()=>{
 const base={amenity:'restaurant',cuisine:'italian;pizza',name:'Sample Pizza'};
 assert.equal(pizzaRestaurantEvidence(base),true);
 assert.equal(matchesIndexedNiche({tags:base},'Pizza restaurants'),true);
 assert.equal(matchesIndexedNiche({tags:{...base,amenity:'fast_food',cuisine:'pizza'}},'Pizza restaurants'),true);
 assert.equal(matchesIndexedNiche({tags:{...base,cuisine:'italian'}},'Pizza restaurants'),false);
 assert.equal(matchesIndexedNiche({tags:{...base,amenity:'bank'}},'Pizza restaurants'),false);
 assert.equal(matchesIndexedNiche({tags:{...base,cuisine:''}},'Pizza restaurants'),false);
 assert.equal(financialAdvisorEvidence({name:'Mortgage finance company',office:'financial'}),false);
 assert.equal(financialAdvisorEvidence({name:'Certified Financial Planner',office:'financial'}),true);
});

test('pizza business niche exists in live backend and UI configuration',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const frontend=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 assert.match(server,/'Pizza restaurants':'\["amenity"/);
 assert.match(frontend,/'Local businesses':\['Pizza restaurants'\]/);
});
