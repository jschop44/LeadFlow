import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcilePublicLeadership} from '../leadership-reconciliation.js';
test('company and Wikidata agreeing on a named role retain both source links without claiming proof',()=>{
 const website='https://ridgeworks.com';
 const claims=[
  {name:'Robin Sanchez',role:'Chief Executive Officer',source:'https://ridgeworks.com/about'},
  {name:'Robin Sanchez',role:'CEO',source:'https://www.wikidata.org/entity/Q123',independentSource:'Wikidata'},
  {name:'Robin Sanchez',role:'CEO',source:'https://ridgeworks.com/leadership'},
 ];
 const people=reconcilePublicLeadership(claims,website);
 assert.equal(people.length,1);
 assert.equal(people[0].sourceCount,3);
 assert.deepEqual(people[0].evidencePublishers,['business_website','wikidata']);
 assert.equal(people[0].corroboration,'company_website_and_wikidata_agree');
 assert.match(people[0].note,/does not independently establish/);
});
test('independent claims are not fabricated when the company site is silent',()=>{
 const people=reconcilePublicLeadership([
  {name:'Robin Sanchez',role:'Owner',source:'https://www.wikidata.org/entity/Q123',independentSource:'Wikidata'},
 ],'https://ridgeworks.com');
 assert.equal(people[0].corroboration,'single_public_source');
 assert.equal(people[0].evidencePublishers[0],'wikidata');
});
test('rejects unrelated websites and fake Wikidata publisher flags',()=>{
 const people=reconcilePublicLeadership([
  {name:'Robin Sanchez',role:'CEO',source:'https://another-company.com/team'},
  {name:'Robin Sanchez',role:'CEO',source:'https://fake-wikidata.org/entity/Q123',independentSource:'Wikidata'},
  {name:'Robin Sanchez',role:'CEO',source:'https://www.wikidata.org/entity/Q123',independentSource:'Wikidata'}
 ],'https://ridgeworks.com');
 assert.equal(people.length,1);
 assert.equal(people[0].sourceCount,1);
 assert.equal(people[0].source,'https://www.wikidata.org/entity/Q123');
});
