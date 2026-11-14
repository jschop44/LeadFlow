import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {expandNearbyCityResults} from '../local-nearby-results.js';

const fixture=JSON.parse(readFileSync(new URL('../data/maryland-businesses.json',import.meta.url),'utf8'));
const indexed=(fixture.records||[]).map(element=>({element,areas:['maryland'],niches:element.niches||[]}));
const sameNiche=(element,niche)=>Array.isArray(element.niches)&&element.niches.includes(niche);

test('Bel Air pizza discovery expands a sparse real city result with nearby Maryland OSM businesses',()=>{
 const exact=indexed.filter(row=>row.element.tags?.['addr:city']?.toLowerCase()==='bel air'&&sameNiche(row.element,'Pizza restaurants')).map(row=>row.element);
 assert.ok(exact.length>0&&exact.length<20,'Real city matches reproduce the short first page');
 const results=expandNearbyCityResults({area:'Bel Air, Maryland',niche:'Pizza restaurants',exact,records:indexed,matchesNiche:sameNiche});
 assert.ok(results.length>=20,'Genuine nearby source records fill a 20-item result page');
 assert.ok(results.slice(0,exact.length).every((row,i)=>row.tags.name===exact[i].tags.name),'Existing city results keep their order');
 const nearby=results.filter(row=>row.locationMatch==='nearby');
 assert.ok(nearby.length>0);
 assert.ok(nearby.every(row=>row.approxDistanceKm>=0&&row.approxDistanceKm<=12),'Expansion has a hard distance limit');
 assert.ok(nearby.every(row=>row.locationEvidence?.includes('OpenStreetMap')),'Every added lead carries source provenance');
 assert.ok(nearby.every(row=>row.tags?.['addr:city']?.toLowerCase()!=='bel air'),'Out-of-city entries are not labeled as inside Bel Air');
 const uniqueCoordinates=new Set(nearby.map(row=>row.tags.name.toLowerCase()+'|'+Number(row.lat).toFixed(3)+'|'+Number(row.lon).toFixed(3)));
 assert.equal(uniqueCoordinates.size,nearby.length,'No duplicate physical businesses are added');
});
test('ZIP, incomplete-city, ambiguous and already-full searches never widen their geography',()=>{
 const exact=indexed.filter(row=>row.element.tags?.['addr:city']?.toLowerCase()==='bel air'&&sameNiche(row.element,'Pizza restaurants')).map(row=>row.element);
 for(const area of ['21015','Bel Air 21015, MD','Bel Air','Maryland','Springfield, Illinois']){
  const unchanged=expandNearbyCityResults({area,niche:'Pizza restaurants',exact,records:indexed,matchesNiche:sameNiche});
  assert.deepEqual(unchanged,exact,'No inferred nearby radius for '+area);
 }
 const enough=Array.from({length:20},(_,i)=>({...exact[i%exact.length],id:'original-'+i}));
 const unchanged=expandNearbyCityResults({area:'Bel Air, Maryland',niche:'Pizza restaurants',exact:enough,records:indexed,matchesNiche:sameNiche});
 assert.deepEqual(unchanged,enough,'Full pages do not silently expand geographic scope');
});
test('nearby results require at least five source-labeled city coordinate anchors',()=>{
 const exact=[{type:'node',id:1,tags:{name:'Only Pizza','addr:city':'Example Town'},lat:39.5,lon:-76.3,niches:['Pizza restaurants']}];
 const rows=[{element:exact[0],areas:['maryland'],niches:['Pizza restaurants']},
  {element:{type:'node',id:2,tags:{name:'Nearby Pizza','addr:city':'Next Town'},lat:39.501,lon:-76.3,niches:['Pizza restaurants']},areas:['maryland'],niches:['Pizza restaurants']}];
 const results=expandNearbyCityResults({area:'Example Town, Maryland',niche:'Pizza restaurants',exact,records:rows,matchesNiche:sameNiche});
 assert.deepEqual(results,exact,'One observed city business does not establish a safe city centroid');
});
test('nearby expansion does not invent an owner, contact email, or location',()=>{
 const exact=indexed.filter(row=>row.element.tags?.['addr:city']?.toLowerCase()==='bel air'&&sameNiche(row.element,'Pizza restaurants')).map(row=>row.element);
 const result=expandNearbyCityResults({area:'Bel Air, Maryland',niche:'Pizza restaurants',exact,records:indexed,matchesNiche:sameNiche});
 const sourceKeys=new Set(indexed.map(row=>row.element.type+'/'+row.element.id));
 for(const nearby of result.filter(row=>row.locationMatch==='nearby')){
  assert.ok(sourceKeys.has(nearby.type+'/'+nearby.id),'Each lead must match a real source element');
  assert.ok(!('owner' in nearby)||nearby.owner===undefined,'No ownership claim is fabricated');
 }
});
