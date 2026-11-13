import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegionalSearch,resolveUSState} from '../regional-index.js';

const square={type:'Polygon',coordinates:[[[-80,30],[-70,30],[-70,40],[-80,40],[-80,30]]]};
const states=[
 {code:'US-EX',slug:'example-state',name:'Example State',geometry:square},
 {code:'US-DC',slug:'district-of-columbia',name:'District of Columbia',geometry:square},
 {code:'US-NY',slug:'new-york',name:'New York',geometry:square}
];
const make=(id,city,options={})=>({type:'node',id,lat:35,lon:-75,niches:['Accountants'],tags:{name:'Public firm '+id,'addr:city':city,...options}});
const output={region_slug:'example-state',generated_at:'2026-11-10T00:00:00Z',
 records:[...Array.from({length:9},(_,i)=>make(i+1,'Large City')),
          make(20,'Small City',{'contact:email':'office@public.test',website:'https://public.test'}),
          make(30,'Other City',{phone:'123'}),make(31,'Other City',{email:'hello@example.test'}),
          make(40,'Other City',{'addr:country':'CA'}),make(41,'Large City',{name:'Insurer',office:'insurance',description:'Insurance',...{'addr:country':'US'},website:'https://insurance.test'})]};
test('resolves full state names/codes without accidentally hijacking city queries',()=>{
 assert.equal(resolveUSState('EX',states).code,'US-EX');
 assert.equal(resolveUSState('Example State, USA',states).slug,'example-state');
 assert.equal(resolveUSState('new-york',states).slug,'new-york');
 assert.equal(resolveUSState('DC',states).code,'US-DC');
 assert.equal(resolveUSState('Washington, DC',states).code,'US-DC');
 assert.equal(resolveUSState('New York, NY',states),null);
 assert.equal(resolveUSState('Portland, Oregon',states),null);
});
test('statewide query searches whole snapshot and rotates cities, rather than a bbox',async()=>{
 let downloads=0;
 const search=createRegionalSearch({definitions:states,load:async()=>{downloads++;return output;},
 now:()=>Date.parse('2026-11-11T00:00:00Z')});
 const result=await search.statewide({area:'EX',niche:'Accountants',limit:6});
 assert.equal(result.scope,'statewide');
 assert.equal(result.source,'Published US regional business index');
 assert.equal(result.totalMatched,13);
 assert.equal(result.cityCoverage,3);
 assert.equal(result.elements.length,6);
 assert.equal(new Set(result.elements.map(x=>x.tags['addr:city'])).size,3);
 assert.equal(result.elements.some(x=>x.tags['addr:country']==='CA'),false);
 assert.equal(result.elements.find(x=>x.tags['addr:city']==='Small City').tags.website,'https://public.test');
 assert.equal(result.elements[0].snapshotDate,output.generated_at);
 assert.equal(result.snapshotSources[0].stale,false);
 assert.equal(downloads,1);
 assert.equal((await search.statewide({area:'Example State',niche:'Accountants'})).cached,true);
 assert.equal(downloads,1);
});
test('statewide query respects niche precision and does not relabel insurance as advisory',async()=>{
 const data={...output,records:[make(1,'Any City',{office:'insurance'}),make(2,'Any City',{office:'insurance',description:'Financial planning'})].map(x=>({...x,niches:['Financial advisors','Insurance agencies']}))};
 const search=createRegionalSearch({definitions:states,load:async()=>data});
 const result=await search.statewide({area:'EX',niche:'Financial advisors'});
 assert.equal(result.totalMatched,1);
 assert.equal(result.elements[0].id,2);
});
test('statewide failures are not silently converted into no-business-exists claims',async()=>{
 const offline=createRegionalSearch({definitions:states,load:async()=>{throw Error('offline')}});
 const result=await offline.statewide({area:'EX',niche:'Accountants'});
 assert.equal(result.elements.length,0);
 assert.equal(result.searchStatus,'provider_unavailable');
 assert.match(result.message,/does not imply/);
 assert.equal(await offline.statewide({area:'Not a state',niche:'Accountants'}),null);
});
