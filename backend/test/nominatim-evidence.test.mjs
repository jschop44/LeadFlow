import test from 'node:test';
import assert from 'node:assert/strict';
import {nominatimBusinessLead} from '../nominatim-evidence.js';
import {matchesIndexedNiche} from '../regional-index.js';

const place=(overrides={})=>({
 place_id:12345,osm_type:'node',osm_id:456,lat:'39.535',lon:'-76.348',
 category:'amenity',type:'restaurant',name:'Bel Air Pizza House',
 display_name:'Bel Air Pizza House, Harford County, Maryland, United States',
 address:{city:'Bel Air',country_code:'us'},
 extratags:{cuisine:'pizza;italian',website:'https://pizza.example',phone:'410-555-0118'},
 ...overrides
});

test('published Nominatim restaurant and cuisine evidence survives niche validation',()=>{
 const row=nominatimBusinessLead(place());
 assert.ok(row);
 assert.equal(row.tags.amenity,'restaurant');
 assert.equal(row.tags.cuisine,'pizza;italian');
 assert.equal(row.tags.website,'https://pizza.example');
 assert.equal(row.listingVerification,'community_contributed_nominatim');
 assert.deepEqual(row.sourceAgreement,['Nominatim search']);
 assert.equal(matchesIndexedNiche(row,'Pizza restaurants'),true);
});

test('fast food with published pizza identity qualifies without inventing cuisine',()=>{
 const row=nominatimBusinessLead(place({type:'fast_food',name:'Mario Pizza',extratags:{}}));
 assert.equal(row.tags.amenity,'fast_food');
 assert.equal(row.tags.cuisine,undefined);
 assert.equal(matchesIndexedNiche(row,'Pizza restaurants'),true);
});

test('pizza stores, generic restaurants, and unverified category descriptions are not promoted',()=>{
 const cases=[
  place({category:'shop',type:'supermarket',name:'Pizza Supply Store'}),
  place({category:'amenity',type:'restaurant',name:'Garden Cafe',extratags:{cuisine:'vegetarian'}}),
  place({category:'amenity',type:'cafe',name:'Pizza Cafe',extratags:{cuisine:'pizza'}}),
  place({category:'shop',type:'pizza',name:'Pizza Supplies',extratags:{cuisine:'pizza'}}),
  place({category:'amenity',type:'restaurant',name:'General Restaurant',extratags:{}})
 ];
 for(const raw of cases){
  const row=nominatimBusinessLead(raw);
  assert.ok(row,raw.name);
  assert.equal(matchesIndexedNiche(row,'Pizza restaurants'),false,raw.name);
 }
});

test('country and coordinate safety still gate source records, including Alaska and Hawaii',()=>{
 assert.equal(nominatimBusinessLead(place({address:{country_code:'ca'}})),null);
 assert.equal(nominatimBusinessLead(place({lat:'NaN'})),null);
 assert.equal(nominatimBusinessLead(place({lon:'192'})),null);
 assert.ok(nominatimBusinessLead(place({lat:'61.2',lon:'-149.9',address:{country_code:'us'}})));
 assert.ok(nominatimBusinessLead(place({lat:'21.3',lon:'-157.8',address:{country_code:'us'}})));
});
