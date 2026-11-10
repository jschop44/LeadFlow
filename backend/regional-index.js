import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
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
 if(!Array.isArray(declared)||!declared.includes(niche))return false;
 if(niche==='Financial advisors'&&/insurance/i.test(row?.tags?.office||'')){
  const facts=['name','description','service','services'].map(key=>String(row?.tags?.[key]||'')).join(' ');
  return /financial advis(?:or|er)|financial plann|wealth manag|investment advis(?:or|er)/i.test(facts);
 }
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
 return async({lat,lon,bbox,niche})=>{
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
}
