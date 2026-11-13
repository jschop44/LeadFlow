import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {financialAdvisorEvidence,pizzaRestaurantEvidence} from './business-niche-evidence.js';
const regions=JSON.parse(readFileSync(new URL('./data/us-regions.json',import.meta.url),'utf8')).regions;
const ROOT='https://raw.githubusercontent.com/jschop44/LeadFlow/main/backend/data/us-regional/';
function insideRing(lon,lat,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [x,y]=ring[i],[px,py]=ring[j];
  if((y>lat)!==(py>lat)&&lon<(px-x)*(lat-y)/(py-y)+x)inside=!inside;
 }
 return inside;
}
export function matchesIndexedNiche(row,niche,declared=row?.niches){
 if(niche==='Pizza restaurants')return pizzaRestaurantEvidence(row?.tags);
 if(!Array.isArray(declared)||!declared.includes(niche))return false;
 if(niche==='Financial advisors')return financialAdvisorEvidence(row?.tags);
 return true;
}
export function containsPoint(geometry,lon,lat){
 const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
 return polygons.some(rings=>insideRing(lon,lat,rings[0])&&!rings.slice(1).some(ring=>insideRing(lon,lat,ring)));
}
async function download(url){
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(6000),headers:{'user-agent':'LeadFlow/1.0 published-index'}});
 if(!response.ok)throw Error('Regional index unavailable');
 const reader=response.body.getReader(),chunks=[];let bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>5000000)throw Error('Regional index exceeds size limit');chunks.push(Buffer.from(value));}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 return JSON.parse(gunzipSync(Buffer.concat(chunks),{maxOutputLength:20000000}).toString('utf8'));
}
// State-only searches must not silently collapse to a box around a state capital.
// City queries such as "New York, NY" are intentionally not treated as state-wide.
export function resolveUSState(area,definitions=regions){
 const raw=String(area||'').trim().replace(/\s+/g,' ').replace(/,?\s*(?:united states(?: of america)?|usa|u\.s\.a\.|us|u\.s\.)\s*$/i,'').trim().replace(/,$/,'').trim().toLowerCase();
 if(!raw)return null;
 if(['washington dc','washington, dc','d.c.','dc'].includes(raw))return definitions.find(r=>r.code==='US-DC')||null;
 return definitions.find(r=>[r.name.toLowerCase(),r.slug,r.slug.replace(/-/g,' '),r.code.slice(3).toLowerCase()].includes(raw))||null;
}
export function createRegionalSearch({load=download,now=Date.now,definitions=regions}={}){
 const cache=new Map(),pending=new Map();
 async function regionData(region){
  const saved=cache.get(region.slug);
  if(saved&&saved.until>now()){cache.delete(region.slug);cache.set(region.slug,saved);return {...saved,cached:true};}
  if(pending.has(region.slug))return pending.get(region.slug);
  const work=Promise.resolve().then(()=>load(ROOT+region.slug+'.json.gz')).then(data=>{
   if(data.region_slug!==region.slug||!Array.isArray(data.records)||data.records.length>50000||!Number.isFinite(Date.parse(data.generated_at)))throw Error('Invalid regional index');
   const value={data,until:now()+21600000,cached:false,stale:false};cache.delete(region.slug);cache.set(region.slug,value);
   while(cache.size>2)cache.delete(cache.keys().next().value);return value;
  }).catch(()=>{if(!saved)return null;const retained={...saved,cached:true,stale:true,until:now()+60000};cache.set(region.slug,retained);return retained;}).finally(()=>pending.delete(region.slug));
  pending.set(region.slug,work);return work;
 }
 const search=async({lat,lon,bbox,niche})=>{
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Array.isArray(bbox)||bbox.length!==4||!bbox.every(Number.isFinite)||typeof niche!=='string')return {elements:[]};
  const [south,north,west,east]=bbox;if(south>north||west>east)return {elements:[]};
  const selected=definitions.filter(r=>containsPoint(r.geometry,lon,lat)).slice(0,2);
  const loaded=await Promise.all(selected.map(regionData)),elements=[],sources=[];
  for(let i=0;i<loaded.length;i++){
   const state=loaded[i];if(!state)continue;
   const source='OpenStreetMap Geofabrik '+selected[i].name+' extract';
   sources.push({region:selected[i].name,generated_at:state.data.generated_at,stale:state.stale||now()-Date.parse(state.data.generated_at)>1209600000});
   for(const row of state.data.records){
    if(typeof row?.tags?.name!=='string'||!row.tags.name.trim()||row.tags.name.length>240||!['node','way','relation'].includes(row.type)||!Number.isSafeInteger(row.id)||!matchesIndexedNiche(row,niche)||!Number.isFinite(row.lat)||!Number.isFinite(row.lon)||row.lat<south||row.lat>north||row.lon<west||row.lon>east||!containsPoint(selected[i].geometry,row.lon,row.lat))continue;
    if(row.tags['addr:country']&&!['US','USA','United States'].includes(row.tags['addr:country']))continue;
    elements.push({...row,sourceAgreement:Array.isArray(row.sourceAgreement)&&row.sourceAgreement.some(x=>typeof x==='string'&&x.trim())?row.sourceAgreement.filter(x=>typeof x==='string'&&x.trim()).slice(0,3):[source],sourceCount:1,classification:'Local',listingVerification:'community_contributed_snapshot',snapshotDate:state.data.generated_at});
   }
  }
  elements.sort((a,b)=>Math.hypot(a.lat-lat,a.lon-lon)-Math.hypot(b.lat-lat,b.lon-lon));
  return {elements:elements.slice(0,250),source:'Published US regional business index',snapshotSources:sources,cached:loaded.some(x=>x?.cached),coverage:'Partial community-contributed listings. Snapshot age and contacts must be reviewed; listing identity is not independently verified.'};
 };
 // A state search uses the whole state extract, rather than an arbitrary city-sized bbox.
 // The deterministic city round-robin prevents one large metro from occupying every result.
 search.statewide=async({area,niche,limit=250}={})=>{
  const region=resolveUSState(area,definitions);
  if(!region)return null;
  const source='OpenStreetMap Geofabrik '+region.name+' extract';
  const state=await regionData(region);
  const empty={elements:[],area:region.name,stateCode:region.code,scope:'statewide',source:'Published US regional business index',
   cached:Boolean(state?.cached),snapshotSources:state?[{region:region.name,generated_at:state.data.generated_at,stale:state.stale||now()-Date.parse(state.data.generated_at)>1209600000}]:[],
   coverage:'Partial community-contributed listing snapshot; published contact details and niche classification require review.'};
  if(!state)return {...empty,searchStatus:'provider_unavailable',message:'State index unavailable. This does not imply no businesses exist.'};
  const groups=new Map();
  const seen=new Set();
  let totalMatched=0;
  for(const row of state.data.records){
   if(typeof row?.tags?.name!=='string'||!row.tags.name.trim()||row.tags.name.length>240||!['node','way','relation'].includes(row.type)||!Number.isSafeInteger(row.id)||!Array.isArray(row.niches)||!matchesIndexedNiche(row,niche)||!Number.isFinite(row.lat)||!Number.isFinite(row.lon)||!containsPoint(region.geometry,row.lon,row.lat))continue;
   if(row.tags['addr:country']&&!['US','USA','United States'].includes(row.tags['addr:country']))continue;
   const identity=row.type+'/'+row.id;if(seen.has(identity))continue;seen.add(identity);
   const tags=row.tags;
   const contactQuality=Number(Boolean(tags.website||tags['contact:website']))*4+Number(Boolean(tags.email||tags['contact:email']))*3+Number(Boolean(tags.phone||tags['contact:phone']))*2+Number(Boolean(tags['addr:street']))+Number(Boolean(tags['contact:linkedin']||tags['contact:facebook']));
   const city=String(tags['addr:city']||'').trim().toLowerCase().slice(0,100)||'~location not listed';
   const item={...row,sourceAgreement:Array.isArray(row.sourceAgreement)&&row.sourceAgreement.some(x=>typeof x==='string'&&x.trim())?row.sourceAgreement.filter(x=>typeof x==='string'&&x.trim()).slice(0,3):[source],
    sourceCount:1,classification:'Local',listingVerification:'community_contributed_snapshot',snapshotDate:state.data.generated_at};
   if(!groups.has(city))groups.set(city,[]);
   groups.get(city).push({item,contactQuality});
   totalMatched++;
  }
  for(const bucket of groups.values())bucket.sort((a,b)=>b.contactQuality-a.contactQuality||a.item.tags.name.localeCompare(b.item.tags.name));
  const cities=[...groups.keys()].sort((a,b)=>(b!=='~location not listed')-(a!=='~location not listed')||a.localeCompare(b));
  const cap=Math.max(1,Math.min(250,Number.isSafeInteger(limit)?limit:250));
  const selected=[];
  for(let offset=0;selected.length<cap;offset++){
   let any=false;
   for(const city of cities){
    const value=groups.get(city)[offset];
    if(value){selected.push(value.item);any=true;if(selected.length===cap)break;}
   }
   if(!any)break;
  }
  return {...empty,elements:selected,totalMatched,cityCoverage:cities.length,
   searchStatus:totalMatched?'ok':'no_matches',message:totalMatched?'Statewide index results cover multiple listed cities when available; not a complete business census.':'No qualifying businesses found in this partial published state index.'};
 };
 return search;
}
