/** Grounded, bounded nearby-community coverage from an already indexed OSM
 * state snapshot. Do not invent businesses or claim neighboring towns are
 * inside the user's requested city. No new network calls or paid providers.
 */
const normalizeCity=value=>String(value||'').toLowerCase().replace(/[^a-z\s]/g,' ').replace(/\s+/g,' ').trim();
const place=element=>element?.element||element;
function coordinates(element){
 const row=place(element);
 const lat=Number(row?.lat??row?.center?.lat),lon=Number(row?.lon??row?.center?.lon);
 return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon}:null;
}
const median=values=>{const ordered=[...values].sort((a,b)=>a-b);return ordered[Math.floor(ordered.length/2)]};
function distanceKm(a,b){
 const rad=Math.PI/180,dx=(b.lat-a.lat)*rad,dy=(b.lon-a.lon)*rad;
 const h=Math.sin(dx/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dy/2)**2;
 return 12742*Math.asin(Math.min(1,Math.sqrt(h)));
}
const domain=row=>{
 try{const raw=row?.tags?.website||row?.tags?.['contact:website'];if(!raw)return '';const u=new URL(raw);return ['https:','http:'].includes(u.protocol)?u.hostname.toLowerCase().replace(/^www\./,''):''}catch{return ''}
};
const identity=row=>{
 const coords=coordinates(row),name=String(row?.tags?.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 return name+'|'+(coords?coords.lat.toFixed(3):'')+'|'+(coords?coords.lon.toFixed(3):'');
};
const isMaryland=row=>(row?.areas||[]).some(area=>/\b(?:maryland|md)\b/i.test(area))
 ||/\b(?:maryland|md)\b/i.test(row?.element?.tags?.['addr:state']||'');

/** Keep city matches first, then include distance-labeled nearby listings only
 * when 20 local results cannot be filled and >=5 matching-city anchor points
 * support a plausible center. An approximate 12km radius is not a city limit.
 */
export function expandNearbyCityResults({area,niche,exact,records,matchesNiche,minPageSize=20,radiusKm=12,limit=250}){
 if(!Array.isArray(exact)||exact.length>=minPageSize||!/\b(?:maryland|md)\b/i.test(String(area)))return exact||[];
 const query=String(area).toLowerCase();
 if(/\b\d{5}\b/.test(query))return exact; // ZIP searches already use their own geocoded radius.
 const city=normalizeCity(query.replace(/\b(?:maryland|md|united states|usa|us)\b/g,''));
 if(city.length<3)return exact;
 const all=[...records];
 const anchors=all.filter(row=>isMaryland(row)&&normalizeCity(place(row)?.tags?.['addr:city'])===city)
  .map(coordinates).filter(Boolean);
 if(anchors.length<5)return exact;
 const center={lat:median(anchors.map(point=>point.lat)),lon:median(anchors.map(point=>point.lon))};
 const original=exact.map(row=>({...row,locationMatch:'city'}));
 const ids=new Set(original.map(identity)),domains=new Set(original.map(domain).filter(Boolean));
 const nearby=all.filter(row=>isMaryland(row)&&matchesNiche(place(row),niche,row.niches||[niche]))
  .map(row=>({element:place(row),coordinate:coordinates(row)}))
  .filter(item=>item.coordinate)
  .map(item=>({...item,approxDistanceKm:distanceKm(center,item.coordinate)}))
  .filter(item=>item.approxDistanceKm<=radiusKm)
  .sort((a,b)=>a.approxDistanceKm-b.approxDistanceKm
   ||String(a.element.tags?.name||'').localeCompare(String(b.element.tags?.name||'')));
 for(const item of nearby){
  if(original.length>=limit)break;
  const key=identity(item.element),site=domain(item.element);
  if(ids.has(key)||site&&domains.has(site))continue;
  ids.add(key);
  if(site)domains.add(site);
  const ownCity=normalizeCity(item.element.tags?.['addr:city']);
  original.push({...item.element,locationMatch:ownCity===city?'city':'nearby',
   approxDistanceKm:Math.round(item.approxDistanceKm*10)/10,
   locationEvidence:'OpenStreetMap coordinates; approximate distance from indexed city center'});
 }
 return original;
}
