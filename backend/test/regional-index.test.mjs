import test from 'node:test';
import assert from 'node:assert/strict';
import {containsPoint,createRegionalSearch,matchesIndexedNiche} from '../regional-index.js';
const polygon={type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[4,4],[6,4],[6,6],[4,6],[4,4]]]};
const definitions=[{slug:'test-region',name:'Test Region',geometry:polygon}];
const row={type:'node',id:1,lat:2,lon:2,niches:['Accountants'],tags:{name:'Synthetic test business',email:'public@example.test'}};
const data={region_slug:'test-region',generated_at:'2026-11-01T00:00:00Z',records:[row]};
const query={lat:2,lon:2,bbox:[1,3,1,3],niche:'Accountants'};
test('region geometry handles polygon holes and multipolygons',()=>{
 assert.equal(containsPoint(polygon,2,2),true);assert.equal(containsPoint(polygon,5,5),false);
 assert.equal(containsPoint({type:'MultiPolygon',coordinates:[polygon.coordinates]},2,2),true);
 assert.equal(containsPoint(polygon,-20,2),false);
});
test('regional fallback enforces niche, local bounds, source geography and US records',async()=>{
 const records=[row,{...row,id:2,niches:['Dentists']},{...row,id:3,lat:9},{...row,id:4,tags:{name:'Foreign fixture','addr:country':'CA'}},{...row,id:5,lat:5,lon:5}];
 const search=createRegionalSearch({definitions,load:async()=>({...data,records})});
 const result=await search(query);assert.equal(result.elements.length,1);assert.equal(result.elements[0].tags.email,'public@example.test');
 assert.equal(result.elements[0].classification,'Local');assert.equal(result.elements[0].sourceCount,1);assert.match(result.coverage,/not independently verified/);
 assert.equal((await search({...query,lat:20})).elements.length,0);
});
test('coalesces state downloads, caches results and retains dated evidence during an outage',async()=>{
 let calls=0,clock=Date.parse('2026-11-02T00:00:00Z');
 const search=createRegionalSearch({definitions,now:()=>clock,load:async()=>{calls++;if(calls>1)throw Error('offline');return data;}});
 const [a,b]=await Promise.all([search(query),search(query)]);assert.equal(calls,1);assert.equal(a.elements.length,b.elements.length);
 clock+=21600001;const stale=await search(query);assert.equal(stale.elements.length,1);assert.equal(stale.snapshotSources[0].stale,true);
 await search(query);assert.equal(calls,2);
});
test('invalid source files cannot fabricate successful results',async()=>{
 for(const value of [{...data,region_slug:'wrong'}, {...data,generated_at:'unknown'}, {...data,records:'not records'}]){
  const search=createRegionalSearch({definitions,load:async()=>value});assert.equal((await search(query)).elements.length,0);
 }
});
test('official coverage includes all 50 states and DC with real source polygons',async()=>{
 const {readFileSync}=await import('node:fs');const config=JSON.parse(readFileSync(new URL('../data/us-regions.json',import.meta.url)));
 assert.equal(config.regions.length,51);assert.equal(new Set(config.regions.map(r=>r.code)).size,51);
 const ny=config.regions.find(r=>r.code==='US-NY');assert.equal(containsPoint(ny.geometry,-73.996,40.75),true);
 assert.equal(containsPoint(ny.geometry,-118.24,34.05),false);
 for(const region of config.regions)assert.match(region.pbf,/^https:\/\/download\.geofabrik\.de\/north-america\/us\/[a-z-]+-latest\.osm\.pbf$/);
});
test('bounded gzip loader reads published files and preserves attributed seed provenance',async()=>{
 const {gzipSync}=await import('node:zlib');const original=globalThis.fetch;let address;
 globalThis.fetch=async url=>{address=url;return new Response(gzipSync(JSON.stringify({...data,records:[{...row,sourceAgreement:['Attributed business directory fixture']}]})));};
 try{
  const search=createRegionalSearch({definitions});const result=await search(query);
  assert.match(address,/test-region\.json\.gz$/);assert.equal(result.elements.length,1);
  assert.deepEqual(result.elements[0].sourceAgreement,['Attributed business directory fixture']);
  globalThis.fetch=async()=>new Response('invalid gzip');
  assert.equal((await createRegionalSearch({definitions})(query)).elements.length,0);
 }finally{globalThis.fetch=original;}
});

test('insurance listings require explicit advisory evidence before becoming financial-adviser leads',()=>{
 const agency={tags:{name:'Synthetic insurance agency',office:'insurance'},niches:['Financial advisors','Insurance agencies']};
 assert.equal(matchesIndexedNiche(agency,'Financial advisors'),false);
 assert.equal(matchesIndexedNiche(agency,'Insurance agencies'),true);
 assert.equal(matchesIndexedNiche({...agency,tags:{...agency.tags,services:'Financial planning and retirement advisory'}},'Financial advisors'),true);
 assert.equal(matchesIndexedNiche({...agency,tags:{name:'Synthetic advisory firm',office:'financial'}},'Financial advisors'),false);
 assert.equal(matchesIndexedNiche({...agency,tags:{name:'Independent Financial Advisors',office:'financial'}},'Financial advisors'),true);
 assert.equal(matchesIndexedNiche({...agency,tags:{name:'Edward Jones',office:'financial_advisor'}},'Financial advisors'),true);
});
