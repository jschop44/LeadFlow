const endpoint='https://query.wikidata.org/sparql';
export function normalizedWebsite(raw){
 try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))return null;return u.hostname.toLowerCase().replace(/^www\./,'')+u.pathname.replace(/\/+$/,'').toLowerCase()}catch{return null}
}
export function verifiedWikidataPeople(rows,website){
 const expected=normalizedWebsite(website),found=[];
 if(!expected)return found;
 for(const row of rows){
  const official=row.officialWebsite?.value;
  if(!official||normalizedWebsite(official)!==expected)continue;
  const entity=row.item?.value||'';
  if(!/^https?:\/\/www\.wikidata\.org\/entity\/Q\d+$/.test(entity))continue;
  const name=row.personLabel?.value,role=row.role?.value;
  if(typeof name!=='string'||!/^[\p{L}][\p{L} .,'-]{3,89}$/u.test(name)||!['Founder','CEO'].includes(role))continue;
  const person=row.person?.value||'';
  if(!/^https?:\/\/www\.wikidata\.org\/entity\/Q\d+$/.test(person))continue;
  if(!found.some(x=>x.name===name&&x.role===role))found.push({name,role,source:entity,independentSource:'Wikidata',matchedWebsite:official});
 }
 return found.slice(0,15)
}
async function queryLeadership(website,request){
 const u=new URL(website);
 const base=u.origin;
 const candidates=[base,base+'/',base.replace('://www.','://'),base.replace('://www.','://')+'/'];
 if(!u.hostname.startsWith('www.'))candidates.push(u.protocol+'//www.'+u.host,u.protocol+'//www.'+u.host+'/');
 const urls=[...new Set(candidates)].filter(x=>normalizedWebsite(x)===normalizedWebsite(website));
 const values=urls.map(x=>'<'+x+'>').join(' ');
 const query='SELECT ?item ?officialWebsite ?person ?personLabel ?role WHERE { VALUES ?officialWebsite { '+values+' } ?item wdt:P856 ?officialWebsite . { ?item wdt:P112 ?person . BIND("Founder" AS ?role) } UNION { ?item p:P169 ?statement . ?statement ps:P169 ?person . FILTER NOT EXISTS { ?statement pq:P582 ?ended } FILTER NOT EXISTS { ?statement wikibase:rank wikibase:DeprecatedRank } BIND("CEO" AS ?role) } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 30';
 const body=await request(endpoint+'?format=json&query='+encodeURIComponent(query),3500);
 return verifiedWikidataPeople(body.results?.bindings||[],website)
}

async function actionLeadership(website,request){
 const api=params=>'https://www.wikidata.org/w/api.php?'+new URLSearchParams({format:'json',...params});
 const host=new URL(website).hostname.replace(/^www\./,'');
 const search=await request(api({action:'wbsearchentities',search:host.split('.')[0].replace(/-/g,' '),language:'en',type:'item',limit:'5'}),3500);
 const ids=(search.search||[]).map(x=>x.id).filter(x=>/^Q\d+$/.test(x)).slice(0,5);
 if(!ids.length)return [];
 const data=await request(api({action:'wbgetentities',ids:ids.join('|'),props:'claims'}),3500),rows=[];
 for(const [id,entity] of Object.entries(data.entities||{})){
  if(!/^Q\d+$/.test(id))continue;
  const sites=(entity.claims?.P856||[]).filter(c=>c.rank!=='deprecated').map(c=>c.mainsnak?.datavalue?.value);
  const official=sites.find(site=>typeof site==='string'&&normalizedWebsite(site)===normalizedWebsite(website));
  if(!official)continue;
  for(const [property,role] of [['P112','Founder'],['P169','CEO']]){
   for(const claim of entity.claims?.[property]||[]){
    const person=claim.mainsnak?.datavalue?.value?.id;
    if(claim.rank==='deprecated'||claim.qualifiers?.P582?.length||!/^Q\d+$/.test(person||''))continue;
    rows.push({item:{value:'https://www.wikidata.org/entity/'+id},officialWebsite:{value:official},person:{value:'https://www.wikidata.org/entity/'+person},role:{value:role}});
   }
  }
 }
 const people=[...new Set(rows.map(r=>r.person.value.split('/').at(-1)))].slice(0,15);
 if(!people.length)return [];
 const labels=await request(api({action:'wbgetentities',ids:people.join('|'),props:'labels',languages:'en'}),3500);
 return verifiedWikidataPeople(rows.map(row=>({...row,personLabel:{value:labels.entities?.[row.person.value.split('/').at(-1)]?.labels?.en?.value}})),website);
}

export function createLeadershipLookup({fetcher=globalThis.fetch,now=Date.now,maxConcurrent=4,maxEntries=200}={}){
 const cache=new Map(),pending=new Map();
 return async website=>{
  const key=normalizedWebsite(website);if(!key)throw Error('Invalid leadership website');
  const saved=cache.get(key);
  if(saved&&saved.until>now()){
   if(saved.failed)throw Error('Leadership providers unavailable; website evidence remains usable');
   return structuredClone(saved.people);
  }
  if(pending.has(key))return structuredClone(await pending.get(key));
  if(pending.size>=maxConcurrent)throw Error('Leadership lookup capacity reached; retry shortly');
  const work=(async()=>{
   const deadline=Date.now()+14000;
   const request=async(url,budget)=>{
    const remaining=deadline-Date.now();if(remaining<=0)throw Error('Leadership lookup deadline reached');
    const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(Math.min(budget,remaining)),headers:{accept:'application/json','user-agent':'LeadFlow/1.0 (public company leadership verification)'}});
    if(!response.ok)throw Error('Leadership provider unavailable');
    let bytes=0;const chunks=[];
    for await(const chunk of response.body){bytes+=chunk.length;if(bytes>2000000)throw Error('Leadership response exceeds limit');chunks.push(Buffer.from(chunk));}
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(body.error)throw Error('Leadership provider rejected query');return body;
   };
   try{
    let people;try{people=await queryLeadership(website,request);}catch{people=await actionLeadership(website,request);}
    cache.delete(key);cache.set(key,{people,until:now()+(people.length?3600000:60000)});
    while(cache.size>maxEntries)cache.delete(cache.keys().next().value);
    return people;
   }catch{
    // Cool down outages without presenting a failed provider as verified empty results.
    cache.delete(key);cache.set(key,{failed:true,until:now()+30000,people:[]});
    while(cache.size>maxEntries)cache.delete(cache.keys().next().value);
    throw Error('Leadership providers unavailable; website evidence remains usable');
   }
  })();
  pending.set(key,work);
  try{return structuredClone(await work);}finally{pending.delete(key);}
 };
}
export const wikidataLeadership=createLeadershipLookup();
