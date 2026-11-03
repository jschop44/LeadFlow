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
  if(!/^https:\/\/www\.wikidata\.org\/entity\/Q\d+$/.test(entity))continue;
  const name=row.personLabel?.value,role=row.role?.value;
  if(typeof name!=='string'||!/^[\p{L}][\p{L} .,'-]{3,89}$/u.test(name)||!['Founder','CEO'].includes(role))continue;
  const person=row.person?.value||'';
  if(!/^https:\/\/www\.wikidata\.org\/entity\/Q\d+$/.test(person))continue;
  if(!found.some(x=>x.name===name&&x.role===role))found.push({name,role,source:entity,independentSource:'Wikidata',matchedWebsite:official});
 }
 return found.slice(0,15)
}
export async function wikidataLeadership(website){
 const u=new URL(website);
 const base=u.origin;
 const candidates=[base,base+'/',base.replace('://www.','://'),base.replace('://www.','://')+'/'];
 if(!u.hostname.startsWith('www.'))candidates.push(u.protocol+'//www.'+u.host,u.protocol+'//www.'+u.host+'/');
 const urls=[...new Set(candidates)].filter(x=>normalizedWebsite(x)===normalizedWebsite(website));
 const values=urls.map(x=>'<'+x+'>').join(' ');
 const query='SELECT ?item ?officialWebsite ?person ?personLabel ?role WHERE { VALUES ?officialWebsite { '+values+' } ?item wdt:P856 ?officialWebsite . { ?item wdt:P112 ?person . BIND("Founder" AS ?role) } UNION { ?item wdt:P169 ?person . BIND("CEO" AS ?role) } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 30';
 const response=await fetch(endpoint+'?format=json&query='+encodeURIComponent(query),{signal:AbortSignal.timeout(6500),headers:{'accept':'application/sparql-results+json','user-agent':'LeadFlow/1.0 (public company leadership verification)'}});
 if(!response.ok)throw Error('Wikidata lookup unavailable: HTTP '+response.status);
 const body=await response.json();
 return verifiedWikidataPeople(body.results?.bindings||[],website)
}
