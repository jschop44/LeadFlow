/** Cross-source leadership claims, retaining provenance rather than inflating authority. */
const normalized=(v)=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();
const roleKey=role=>{
 const r=normalized(role);
 return r==='chief executive officer'||r==='ceo'?'ceo':
 r==='founder'||r==='co-founder'?'founder':
 r==='owner'||r==='proprietor'?'owner':r;
};
const host=url=>{try{return new URL(url).hostname.toLowerCase().replace(/^www\./,'')}catch{return ''}};
export function reconcilePublicLeadership(claims,companyWebsite){
 const companyHost=host(companyWebsite),entries=new Map();
 for(const candidate of claims){
  if(!candidate||typeof candidate.name!=='string'||typeof candidate.role!=='string'||typeof candidate.source!=='string')continue;
  const name=candidate.name.replace(/\s+/g,' ').trim();
  if(name.length<4||name.length>90||!name.includes(' '))continue;
  const sourceHost=host(candidate.source);
  const isOfficial=sourceHost===companyHost&&companyHost!=='';
  const isWikidata=candidate.independentSource==='Wikidata'&&sourceHost==='wikidata.org';
  if(!isOfficial&&!isWikidata)continue;
  const key=normalized(name)+'|'+roleKey(candidate.role);
  const prev=entries.get(key)||{...candidate,name,sources:[],evidencePublishers:[],sourceCount:0,corroboration:'single_public_source'};
  if(!prev.sources.includes(candidate.source))prev.sources.push(candidate.source);
  const publisher=isOfficial?'business_website':'wikidata';
  if(!prev.evidencePublishers.includes(publisher))prev.evidencePublishers.push(publisher);
  prev.sourceCount=prev.sources.length;
  prev.corroboration=prev.evidencePublishers.length>1?'company_website_and_wikidata_agree':'single_public_source';
  prev.note=prev.corroboration==='company_website_and_wikidata_agree'
   ?'Two public publishers report the same name and role; this does not independently establish current employment or beneficial ownership.'
   :'Public publisher claim; role, employment and ownership are not independently verified.';
  entries.set(key,prev);
 }
 return [...entries.values()].sort((a,b)=>b.evidencePublishers.length-a.evidencePublishers.length||b.sourceCount-a.sourceCount||a.name.localeCompare(b.name)).slice(0,30);
}
