import {createRegionalSearch,matchesIndexedNiche,resolveUSState} from './regional-index.js';
import {supportsCatalogNiche} from './catalog-niche-evidence.js';
import {productTextMatches,supportedUSCatalogRecord,observedCommerceControl} from './product-evidence.js';
import {firstPartyMerchantLocation,merchantProductPage,sameMerchantHost,merchantSourceMaxBytes} from './merchant-location-evidence.js';
import {createSearchRunner} from './search-execution.js';
import {nominatimBusinessLead} from './nominatim-evidence.js';
import {createHostPacer} from './provider-pacing.js';
import {serveFrontend} from './frontend.js';
import {createHealthProbe} from './health-probe.js';
import {mapConcurrent,createResearchRunner} from './research-execution.js';
import {forwardForgeEvent} from './forge-events.js';
import {intelligenceAction,startIntelligenceScheduler,configureProspectProvider,configureResearchProvider,configureAuditProvider} from './intelligence-automation.js';
import {knowledgeAction} from './knowledge-base.js';
import {initLeadLibrary,leadLibraryReady,libraryAction,verifyLeadLibrary} from './lead-library.js';
import {oauthStart,oauthCallback,oauthExchange,oauthDisconnect,oauthSend} from './email-oauth.js';
import http from 'node:http';
import {createCatalogStore} from './catalog-store.js';
import {createSearchHistory} from './search-history.js';
import {wikidataLeadership} from './wikidata-leadership.js';
import {reconcilePublicLeadership} from './leadership-reconciliation.js';
import {mailDomainInspector,applyMailDomainEvidence} from './email-domain-evidence.js';
import {extractPublicContacts,mergePublicContactEvidence,discoverContactPages} from './contact-evidence.js';
import {growthLensAudit,auditOpportunity,personalizedDraft,createAuditCache} from './growthlens-outreach.js';
import {createPageSpeedAuditor} from './integrations/pagespeed.js';
import {createHubSpotCompanySync} from './integrations/hubspot.js';
import {createOfficialRegistryLookup} from './integrations/official-registries.js';
import {createNppesLookup} from './integrations/nppes.js';
import dns from 'node:dns/promises';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const PORT=Number(process.env.PORT||10000);
const ORIGIN=process.env.ALLOWED_ORIGIN||'https://leadflow-tp57.onrender.com';
const API_ORIGIN=new URL(process.env.PUBLIC_API_ORIGIN||'https://leadflow-research-api.onrender.com').origin;
const PAGES_ORIGIN='https://jschop44.github.io'; // Exact owner origin; no wildcard cross-origin access.
const allowedOrigin=origin=>origin===ORIGIN||origin===API_ORIGIN||origin===PAGES_ORIGIN;
const TOKEN=process.env.API_TOKEN||'';
const auditWebsiteWithPageSpeed=createPageSpeedAuditor();
const hubspotCRM=createHubSpotCompanySync();
const officialRegistryLookup=createOfficialRegistryLookup();
const healthcareNpiLookup=createNppesLookup();
const KNOWLEDGE_BASE_ENABLED=process.env.KNOWLEDGE_BASE_ENABLED==='true';
const knowledgeHealthProbe=createHealthProbe(()=>knowledgeAction('status'));
const LIMIT=12;
const hits=new Map();
const blocked=(ip)=>{if(net.isIP(ip)===4){const p=ip.split('.').map(Number);return p[0]===0||p[0]===10||p[0]===127||p[0]>=224||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||p[0]===100&&p[1]>=64&&p[1]<=127||p[0]===192&&p[1]===0||p[0]===198&&[18,19].includes(p[1])}return /^(::1|::|f[c-d]|fe80:|::ffff:)/i.test(ip)};
async function validate(raw){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port&& !['80','443'].includes(u.port))throw Error('Restricted URL');const h=u.hostname.toLowerCase();if(!h.includes('.')||h.endsWith('.local')||h.endsWith('.internal')||h.endsWith('.onion')||h==='localhost'||net.isIP(h))throw Error('Restricted host');const records=await dns.lookup(h,{all:true});if(!records.length||records.some(r=>blocked(r.address)))throw Error('Restricted network destination');return u}
async function get(url,maxBytes=350000){
 // Caller cannot request arbitrarily sized or credentialed/network-local HTML.
 maxBytes=maxBytes===2_000_000?2_000_000:350000;
 await validate(url);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
 try{
  const r=await fetch(url,{redirect:'manual',signal:controller.signal,headers:{'user-agent':'LeadFlowBusinessResearch/1.0','accept':'text/html,text/plain'}});
  if(r.status>=300&&r.status<400)throw Error('Redirect disallowed');
  if(!r.ok)throw Error('HTTP '+r.status);
  const type=r.headers.get('content-type')||'';
  if(!type.toLowerCase().includes('text/html')&&!type.toLowerCase().includes('text/plain'))throw Error('Not HTML');
  if(Number(r.headers.get('content-length')||0)>maxBytes)throw Error('Page too large');
  const decoder=new TextDecoder();let body='',bytes=0;
  for await(const chunk of r.body){
   bytes+=chunk.byteLength;
   if(bytes>maxBytes)throw Error('Page too large');
   body+=decoder.decode(chunk,{stream:true});
  }
  return body+decoder.decode();
 }finally{clearTimeout(timer)}
}
configureResearchProvider(async website=>{
 const u=await validate(website);
 if(u.protocol!=='https:')return {status:'unavailable',reason:'HTTPS website required'};
 // Respect robots.txt; inaccessible rules are treated as unavailable.
 const robots=await get(u.origin+'/robots.txt').catch(()=>null);
 if(robots===null||!robotsOK(robots,u.pathname||'/'))return {status:'unavailable',reason:'Robots policy unavailable or access disallowed'};
 const html=await get(u.origin+u.pathname);
 const title=(html.match(new RegExp('<title[^>]*>([^<]{1,180})</title>','i'))||[])[1]?.trim();
 const description=(html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']{1,300})/i)||[])[1]?.trim();
 if(!title&&!description)return {status:'unavailable',reason:'No page title or description verified'};
 return {status:'verified',summary:[title&&'Page title: '+title,description&&'Meta description: '+description].filter(Boolean).join(' | ')};
});
configureAuditProvider(async website=>{
 const target=await validate(website);
 const audit=await cachedGrowthLensAudit(target.origin);
 if(audit.status&&audit.status!=='completed')return {status:'unavailable',reason:'Growth Lens audit is not completed'};
 const finding=auditOpportunity(audit,'website improvements');
 if(!finding.verified)return {status:'unavailable',reason:'No verified actionable audit finding'};
 return {status:'verified',finding:finding.finding+': '+finding.action};
});
function robotsOK(text,path){const groups=text.split(/(?=^user-agent\s*:)/im);let rules=[];for(const group of groups){const lines=group.split(/\r?\n/).map(x=>x.split('#')[0].trim());const agents=lines.filter(x=>/^user-agent\s*:/i.test(x)).map(x=>x.split(':').slice(1).join(':').trim().toLowerCase());if(!agents.includes('*')&&!agents.includes('leadflowbusinessresearch/1.0'))continue;for(const line of lines){const m=line.match(/^(allow|disallow)\s*:\s*(.*)$/i);if(m&&m[2])rules.push({allow:m[1].toLowerCase()==='allow',path:m[2]})}}const matched=rules.filter(r=>path.startsWith(r.path.split('*')[0])).sort((a,b)=>b.path.length-a.path.length)[0];return !matched||matched.allow}
function extract(html,source){return extractPublicContacts(html,source)}
function peopleFromStructuredData(html,source){
 const found=[];const add=(person,role)=>{if(!person)return;const name=typeof person==='string'?person:person.name;if(typeof name!=='string'||name.length<4||name.length>90)return;const clean=name.replace(/\s+/g,' ').trim();if(!/^[\p{L}][\p{L} .,'-]+$/u.test(clean))return;if(!found.some(x=>x.name.toLowerCase()===clean.toLowerCase()&&x.role===role))found.push({name:clean,role,source})};
 const walk=(value,depth=0)=>{if(!value||depth>6)return;if(Array.isArray(value)){value.forEach(x=>walk(x,depth+1));return}if(typeof value!=='object')return;
 const type=String(value['@type']||'').toLowerCase();if(type.includes('organization')||type.includes('localbusiness')||type.includes('corporation')){
 const claimed=String(value.url||value['@id']||'');
 if(/^https?:\/\//i.test(claimed)){
  try{const actual=new URL(claimed).hostname.toLowerCase().replace(/^www\./,''),expected=new URL(source).hostname.toLowerCase().replace(/^www\./,'');if(actual!==expected)return}
  catch{return}
 }
 for(const role of ['founder','employee','member']){const v=value[role];if(v)(Array.isArray(v)?v:[v]).forEach(p=>add(p,role==='founder'?'Founder':'Team member'))}if(value.ceo)(Array.isArray(value.ceo)?value.ceo:[value.ceo]).forEach(p=>add(p,'CEO'));if(value.founder)(Array.isArray(value.founder)?value.founder:[value.founder]).forEach(p=>add(p,'Founder'));if(value.founders)(Array.isArray(value.founders)?value.founders:[value.founders]).forEach(p=>add(p,'Founder'))}
 if(value['@graph'])walk(value['@graph'],depth+1);if(value.mainEntity)walk(value.mainEntity,depth+1);
 };
 for(const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{walk(JSON.parse(m[1]))}catch{}}
 return found.slice(0,15)
}
function peopleFromVisibleText(html,source){
 const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,'\n').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\r/g,'');
 const lines=text.split(/\n+/).map(x=>x.trim().replace(/\s+/g,' ')).filter(Boolean);
 const role='CEO|Chief Executive Officer|President|Founder|Co-Founder|Owner|Managing Partner|Executive Director';
 const person='([A-Z][a-z]+(?:[- ][A-Z][a-z]+){1,3})';
 const patterns=[new RegExp('^'+person+'\\s*[,|–—-]\\s*('+role+')\\b','i'),new RegExp('^('+role+')\\s*[:–—-]\\s*'+person+'$','i')];
 const found=[];
 for(const line of lines.slice(0,1200)){if(line.length>150)continue;for(const [i,re] of patterns.entries()){const m=line.match(re);if(!m)continue;const name=(i===0?m[1]:m[2]).trim(),position=(i===0?m[2]:m[1]).trim();if(!found.some(p=>p.name===name&&p.role===position))found.push({name,role:position,source,evidence:line.slice(0,150)});break}}
 return found.slice(0,12)
}
function evidenceCount(rows,status){return new Set(rows.filter(x=>x.mailDomain?.status===status).map(x=>x.email.split('@')[1])).size;}
async function research(website){
 const u=await validate(website),root=u.origin;
 let robots;
 try{const response=await fetch(root+'/robots.txt',{redirect:'manual',signal:AbortSignal.timeout(7000)});
  if(response.status===404)robots='';
  else if(response.ok)robots=(await response.text()).slice(0,100000);
  else throw Error('Robots policy unavailable');
 }catch{throw Error('Robots policy unavailable')}
 const independentLookup=wikidataLeadership(root).catch(e=>{console.warn('Independent leadership lookup unavailable:',e.message);return []});
 const home=robotsOK(robots,'/')?await get(root+'/').catch(()=>null):null;
 const fixed=['/contact','/contact-us','/about','/about-us','/team','/leadership','/our-team','/management'];
 // Prefer links that the business actually publishes; do not crawl arbitrary site pages.
 const discovered=home?discoverContactPages(home,root,4):[];
 const paths=[...new Set([...discovered,...fixed])].slice(0,12);
 const pages=await mapConcurrent(paths,3,async path=>{
  if(!robotsOK(robots,path))return null;
  try{const html=await get(root+path);
   return {url:root+path,...extract(html,root+path),
    people:[...peopleFromStructuredData(html,root+path),...peopleFromVisibleText(html,root+path)]};
  }catch{return null}
 });
 const sources=[...(home?[{url:root+'/',...extract(home,root+'/'),
  people:[...peopleFromStructuredData(home,root+'/'),...peopleFromVisibleText(home,root+'/')]}]:[]),...pages.filter(Boolean)];
 const combined=mergePublicContactEvidence(sources,root);
 // Domain MX records are only a mail-routing signal, never inbox or owner validation.
 const domainEvidence=await mailDomainInspector(combined.emailEvidence);
 const emailEvidence=applyMailDomainEvidence(combined.emailEvidence,domainEvidence);
 const externalPeople=await independentLookup;
 const people=reconcilePublicLeadership([...combined.namedContacts,...sources.flatMap(x=>x.people||[]),...externalPeople],root);
 return {website:root,emails:emailEvidence.map(item=>item.email),phones:combined.phones,socials:combined.socials,people,
  emailEvidence,namedContacts:combined.namedContacts,
  sources,sourceSummary:{publicPagesReviewed:sources.length,discoveredPageLinks:discovered.length,
   businessDomainEmails:emailEvidence.filter(x=>x.businessDomainMatch).length,
   domainsWithMx:evidenceCount(emailEvidence,'mx_present'),domainsDeclaringNoMail:evidenceCount(emailEvidence,'null_mx'),
   publishedNamedContacts:combined.namedContacts.length},
  independentLeadershipSources:externalPeople.length?['Wikidata']:[],
  note:'Observed public business website contacts with page citations. Emails are not inferred; ownership, employment and deliverability are not independently verified.'}
}
const runResearch=createResearchRunner(research,2,{cacheTtlMs:60*60*1000,maxCached:120});
const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function draft({business,contact,service,benefit,sender,unsubscribe}){const name=String(contact||'').trim()||'there';const company=String(business||'').trim();if(!company||!service||!sender||!unsubscribe)throw Error('Business, service, sender and unsubscribe instructions required');const subject='A quick idea for '+company;const body='Hi '+name+',\n\nI came across '+company+' and thought '+String(service).trim()+' might be relevant. '+(benefit?String(benefit).trim():'Would you be open to a brief conversation?')+'\n\nIf this is not relevant, no worries.\n\n'+sender+'\n\nTo opt out: '+unsubscribe;const html='<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#243047;line-height:1.7"><div style="border-top:5px solid #1dbb97;padding:24px"><p>Hi '+escape(name)+',</p><p>I came across <strong>'+escape(company)+'</strong> and thought '+escape(service)+' might be relevant.</p><p>'+escape(benefit||'Would you be open to a brief conversation?')+'</p><p>If this is not relevant, no worries.</p><p>'+escape(sender)+'</p><hr><small>To opt out: '+escape(unsubscribe)+'</small></div></div>';return {subject,text:body,html,followUps:[{afterDays:4,subject:'Re: '+subject,text:'Hi '+name+', just following up once in case my earlier note got buried. If it is not relevant, I will close the loop.\n\n'+sender+'\nTo opt out: '+unsubscribe},{afterDays:9,subject:'Re: '+subject,text:'Hi '+name+', last note from me. Happy to share more if useful; otherwise I will not follow up further.\n\n'+sender+'\nTo opt out: '+unsubscribe}],status:'draft_only',sendingEnabled:false}}

async function sharedOpportunityRanking(website,findings,platform,businessType){
 const base='https://growthlens-free-test.onrender.com';
 const key=process.env.GROWTHLENS_PRIVATE_KEY;
 if(!key)throw Error('Growth Lens key missing');
 const response=await fetch(base+'/api/intelligence/opportunity-score',{
  method:'POST',headers:{'content-type':'application/json','X-GrowthLens-Key':key},
  body:JSON.stringify({website,findings,platform:platform||null,business_type:businessType||null}),signal:AbortSignal.timeout(9000)
 });
 if(!response.ok)throw Error('Scoring service HTTP '+response.status);
 return response.json();
}
const cachedGrowthLensAudit=createAuditCache(growthLensAudit);
async function smartDraft(data){
 const business=String(data.business||'').trim(),service=String(data.service||'').trim();
 if(!business||!service||!data.sender||!data.unsubscribe)throw Error('Business, service, sender and opt-out instructions required');
 let opportunity={verified:false,reason:'Website unavailable or Growth Lens not configured'};
 let auditStatus='not_available';
 if(data.website){
  const target=await validate(data.website);
  try{
   const audit=await cachedGrowthLensAudit(target.origin);
   auditStatus=audit.status||'completed';
   if(auditStatus==='completed'){
    opportunity=auditOpportunity(audit,service);
    try{
     const shared=await sharedOpportunityRanking(target.origin,audit.findings||[],audit.platform,audit.business_type);
     opportunity={...auditOpportunity(audit,service,shared.ranking),sharedRanking:shared.ranking,sharedScore:shared.score,sharedModel:shared.model};
    }catch(err){console.warn('Shared ranking unavailable:',err.message)}
   }
   else opportunity={verified:false,reason:'Growth Lens returned a partial audit; no verified website finding'};
  }catch(error){auditStatus='unavailable';console.warn('Growth Lens audit not available:',error.message)}
 }
 return {...personalizedDraft(data,opportunity),auditStatus,analysisProvider:'Growth Lens',note:'Draft requires human review. No message was sent. Financial uplift is not asserted.'};
}
function cleanName(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,100)}
function nearby(a,b){if(!a||!b)return false;const lat1=Number(a.lat),lat2=Number(b.lat),lon1=Number(a.lon),lon2=Number(b.lon);return Number.isFinite(lat1)&&Number.isFinite(lat2)&&Number.isFinite(lon1)&&Number.isFinite(lon2)&&Math.abs(lat1-lat2)<.012&&Math.abs(lon1-lon2)<.015}
function features(t){return [1,Number(!!(t.website||t['contact:website'])),Number(!!(t.phone||t['contact:phone'])),Number(!!(t.email||t['contact:email'])),Number(!!(t['addr:street']||t['addr:city'])),Number(!!t.name),Number(!!(t['contact:linkedin']||t['contact:facebook'])),Number(!!t['source:ref'])]}
function sigmoid(x){return 1/(1+Math.exp(-Math.max(-30,Math.min(30,x))))}
function trainWeakSupervision(elements){const examples=elements.filter(x=>x.tags?.name).slice(0,250).flatMap(x=>{const t=x.tags;const f=features(t);const positive=Number(!!(t.website||t['contact:website'])&&!!(t.phone||t['contact:phone']));return [{f,y:positive},{f:[1,0,0,0,0,1,0,0],y:0}]});let w=Array(8).fill(0);for(let epoch=0;epoch<80;epoch++){for(const {f,y} of examples){const p=sigmoid(w.reduce((a,v,i)=>a+v*f[i],0)),err=p-y;for(let i=0;i<w.length;i++)w[i]-=.035*(err*f[i]+.002*w[i])}}return {weights:w,examples:examples.length,method:'logistic regression trained on weak labels from public listing completeness; not ground-truth verification'}}
async function wikidataPlaces(lat,lon,niche){const terms={'Financial advisors':'financial advisor','Real estate agents':'real estate','Accountants':'accounting','Insurance agencies':'insurance','Marketing agencies':'marketing','Dental practices':'dentist','Fitness coaches':'fitness','Wellness clinics':'clinic'};const term=terms[niche];if(!term)return [];const sparql='SELECT ?item ?itemLabel ?coord ?website WHERE { SERVICE wikibase:around { ?item wdt:P625 ?coord . bd:serviceParam wikibase:center "Point('+Number(lon)+' '+Number(lat)+')"^^geo:wktLiteral . bd:serviceParam wikibase:radius "25" . } ?item rdfs:label ?itemLabel . FILTER(LANG(?itemLabel)="en") FILTER(CONTAINS(LCASE(STR(?itemLabel)),"'+term.split(' ')[0]+'")) OPTIONAL { ?item wdt:P856 ?website } } LIMIT 80';const u='https://query.wikidata.org/sparql?format=json&query='+encodeURIComponent(sparql);const response=await fetchJSON(u);return (response.results?.bindings||[]).map(x=>({type:'wikidata',id:x.item?.value?.split('/').pop(),lat:Number((x.coord?.value||'').match(/Point\(([-\d.]+) ([-\d.]+)\)/)?.[2]),lon:Number((x.coord?.value||'').match(/Point\(([-\d.]+) ([-\d.]+)\)/)?.[1]),tags:{name:x.itemLabel?.value||'',website:x.website?.value||''},independentSource:x.item?.value})).filter(x=>x.tags.name&&Number.isFinite(x.lat)&&Number.isFinite(x.lon))}
function mergeSources(osm,other){const merged=osm.map(x=>({...x,sourceAgreement:['OpenStreetMap']}));let added=0,matched=0;for(const item of other){const match=merged.find(x=>cleanName(x.tags?.name)===cleanName(item.tags.name)&&nearby({lat:x.lat||x.center?.lat,lon:x.lon||x.center?.lon},item));if(match){match.sourceAgreement.push('Wikidata');match.independentSource=item.independentSource;matched++;if(!match.tags.website&&item.tags.website)match.tags.website=item.tags.website}else{merged.push({...item,sourceAgreement:['Wikidata']});added++}}return {elements:merged,added,matched}}
const STORE_DIR=process.env.LEADFLOW_DATA_DIR||'/tmp/leadflow-data'; // Render free instances have ephemeral filesystems
const STORE_FILE=join(STORE_DIR,'business-index.json');
const SNAPSHOT_FILE=join(dirname(fileURLToPath(import.meta.url)),'data','maryland-businesses.json');
const SNAPSHOT_URL=process.env.LEADFLOW_INDEX_URL||'https://raw.githubusercontent.com/jschop44/LeadFlow/main/backend/data/maryland-businesses.json';
const businessIndex=new Map();
let prospectIndexOffset=0;
configureProspectProvider(()=>{
 // Combine mapped local businesses with independently verified nationwide catalog entries.
 // Rotate both sources so the bounded intelligence cycle can eventually ingest all of them.
 const mapped=Array.from(businessIndex.entries()).map(([key,row])=>{
  const tags=row.element?.tags||{};
  return {key,name:tags.name||'',website:tags.website||tags['contact:website']||'',city:tags['addr:city']||'',niche:row.niches?.find(n=>matchesIndexedNiche(row.element,n,row.niches))||'',source:'OpenStreetMap indexed snapshot'};
 });
 const nationwide=Array.from(onlineCatalog.values()).filter(row=>['Online','Local + Online','Web presence'].includes(row.classification)).map(row=>{
  const tags=row.element?.tags||{};
  return {key:'nationwide:'+row.domain,name:tags.name||'',website:tags.website||'',city:tags['addr:city']||'',niche:row.niches?.find(n=>supportsCatalogNiche(row,n))||'',source:'Wikidata nationwide verified catalog'};
 });
 // Interleave catalog and mapped records so neither source starves when batches are capped.
 const combined=[];
 for(let i=0;i<Math.max(nationwide.length,mapped.length);i++){
  if(i<nationwide.length)combined.push(nationwide[i]);
  if(i<mapped.length)combined.push(mapped[i]);
 }
 const seen=new Set(),entries=[];
 for(const item of combined){
  const domain=catalogDomain(item.website);
  const key=domain?'domain:'+domain:item.key;
  if(!item.name||!item.niche||seen.has(key))continue;
  seen.add(key);entries.push(item);
 }
 if(!entries.length)return [];
 const count=Math.min(entries.length,100),batch=[];
 for(let i=0;i<count;i++)batch.push(entries[(prospectIndexOffset+i)%entries.length]);
 prospectIndexOffset=(prospectIndexOffset+count)%entries.length;
 return batch;
});
let persistPending=Promise.resolve();
function recordKey(x){const t=x.tags||{};const name=cleanName(t.name);const lat=Number(x.lat??x.center?.lat),lon=Number(x.lon??x.center?.lon);const address=[t['addr:housenumber'],t['addr:street'],t['addr:city'],t['addr:postcode']].filter(Boolean).join(' ').toLowerCase().replace(/\s+/g,' ').trim();return name+'|'+(Number.isFinite(lat)?lat.toFixed(3):address)+'|'+(Number.isFinite(lon)?lon.toFixed(3):'')}
function indexResults(elements,area,niche){let added=0;for(const item of elements){if(!item.tags?.name||!matchesIndexedNiche(item,niche,item.niches||[niche]))continue;const id=recordKey(item);if(!id||id.startsWith('|'))continue;const prev=businessIndex.get(id);const sources=[...new Set([...(prev?.sources||[]),...(item.sourceAgreement||['OpenStreetMap'])])];businessIndex.set(id,{element:{...prev?.element,...item,tags:{...prev?.element?.tags,...item.tags},sourceAgreement:sources,sourceCount:sources.length},sources,areas:[...new Set([...(prev?.areas||[]),area.toLowerCase()])],niches:[...new Set([...(prev?.niches||[]),niche])],updatedAt:Date.now()});if(!prev)added++}if(added||elements.length)persistIndex();return added}
function persistIndex(){persistPending=persistPending.then(async()=>{await mkdir(STORE_DIR,{recursive:true});const temp=STORE_FILE+'.tmp';await writeFile(temp,JSON.stringify([...businessIndex.entries()].slice(-20000)));await rename(temp,STORE_FILE)}).catch(e=>console.warn('Business index persistence failed:',e.message))}
async function loadIndex(){try{const rows=JSON.parse(await readFile(STORE_FILE,'utf8'));for(const [k,v] of rows)businessIndex.set(k,v);console.log('Loaded',businessIndex.size,'indexed business records')}catch(e){if(e.code!=='ENOENT')console.warn('Business index load failed:',e.message)}}
function indexedResults(area,niche){
 const q=String(area||'').trim().toLowerCase(),zip=q.match(/\b\d{5}\b/)?.[0];
 const terms=q.replace(/\b\d{5}\b/g,'').replace(/\b(maryland|md|united states|usa|us)\b/g,'').replace(/[^a-z\s]/g,' ').trim().replace(/\s+/g,' ');
 const target=zip==='21015'?{lat:39.535,lon:-76.35}:null;
 const distanceKm=(a,b,c,d)=>{const R=6371,rad=Math.PI/180,x=(c-a)*rad,y=(d-b)*rad;return 2*R*Math.asin(Math.sqrt(Math.sin(x/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(y/2)**2))};
 const matches=[...businessIndex.values()].filter(v=>{
  if(!matchesIndexedNiche(v.element,niche,v.niches))return false;
  const t=v.element?.tags||{},city=String(t['addr:city']||'').toLowerCase(),postcode=String(t['addr:postcode']||'');
  const areas=(v.areas||[]).filter(a=>a&&a.length>=3);
  if(zip){if(postcode===zip||areas.includes(zip))return true;if(target&&Number.isFinite(v.element?.lat)&&Number.isFinite(v.element?.lon)&&distanceKm(target.lat,target.lon,v.element.lat,v.element.lon)<=12)return true;return false}
  if(terms){return city===terms||city.includes(terms)||areas.some(a=>a===terms||a.includes(terms))}
  return q.includes('maryland')||q==='md'?areas.includes('maryland'):areas.some(a=>a===q);
 });
 return matches.map(v=>v.element).slice(0,250);
}
await loadIndex();
try{const snapshot=JSON.parse(await readFile(SNAPSHOT_FILE,'utf8'));for(const item of snapshot.records||[]){const id=recordKey(item);if(!businessIndex.has(id))businessIndex.set(id,{element:item,sources:item.sourceAgreement||['OpenStreetMap Geofabrik Maryland extract'],areas:[String(item.tags?.['addr:city']||'').toLowerCase(),String(item.tags?.['addr:postcode']||'').toLowerCase(),'maryland'],niches:item.niches||[],updatedAt:Date.now()})}console.log('Loaded Maryland source snapshot:',snapshot.records?.length||0)}catch(e){if(e.code!=='ENOENT')console.warn('Maryland source snapshot unavailable:',e.message)}
async function refreshSourceSnapshot(){
 try{
  const response=await fetch(SNAPSHOT_URL,{signal:AbortSignal.timeout(12000),headers:{'user-agent':'LeadFlow/1.0 business-index-loader'}});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();
  if(!Array.isArray(data.records)||!data.records.length)throw Error('Empty source snapshot');
  let added=0;
  for(const item of data.records){
   if(!item.tags?.name||!item.niches?.length)continue;
   const id=recordKey(item);
   if(businessIndex.has(id))continue;
   businessIndex.set(id,{element:item,sources:item.sourceAgreement||['OpenStreetMap'],areas:[String(item.tags['addr:city']||'').toLowerCase(),String(item.tags['addr:postcode']||'').toLowerCase(),'maryland'],niches:item.niches,updatedAt:Date.now()});
   added++;
  }
  console.log('Remote Maryland index refreshed',JSON.stringify({records:data.records.length,added,total:businessIndex.size}));
 }catch(e){console.warn('Remote index refresh skipped:',e.message)}
}
if(businessIndex.size===0)await refreshSourceSnapshot();
setInterval(refreshSourceSnapshot,6*60*60*1000).unref();
const searchCache=new Map();
const nicheTags={'Financial advisors':'["office"~"financial_advisor|financial|investment|insurance"]','Real estate agents':'["office"="estate_agent"]','Accountants':'["office"="accountant"]','Insurance agencies':'["office"="insurance"]','Business coaches':'["office"="consulting"]','Marketing agencies':'["office"="advertising"]','Fitness coaches':'["leisure"="fitness_centre"]','Dental practices':'["amenity"="dentist"]','Med spas':'["beauty"="spa"]','Nutritionists':'["healthcare"="nutrition_counselling"]','Chiropractors':'["healthcare"="chiropractor"]','Wellness clinics':'["healthcare"="clinic"]','Dating coaches':'["name"~"dating coach|dating consultant",i]','Matchmakers':'["name"~"matchmak",i]','Couples counselors':'["healthcare"="psychotherapist"]','Wedding planners':'["office"="event_planner"]','Relationship coaches':'["name"~"relationship coach|relationship therap",i]','Pizza restaurants':'["amenity"~"restaurant|fast_food"]["cuisine"~"pizza",i]'};
const nominatimRequests=createHostPacer({minIntervalMs:1100,ttlMs:6*60*60*1000});
async function fetchJSON(url,options={}){
 const retrieve=async()=>{
  const r=await fetch(url,{...options,signal:options.signal||AbortSignal.timeout(18000),headers:{'user-agent':'LeadFlowBusinessDiscovery/1.0 (contact: leadflow project)','accept':'application/json',...(options.headers||{})}});
  if(!r.ok)throw Error('Public listing provider returned '+r.status);
  return r.json();
 };
 return new URL(url).hostname==='nominatim.openstreetmap.org'?nominatimRequests(url,retrieve):retrieve();
}
async function nominatimFallback(area,niche){const terms={'Financial advisors':'financial advisor','Real estate agents':'real estate agency','Accountants':'accountant','Insurance agencies':'insurance agency','Business coaches':'business consultant','Marketing agencies':'marketing agency','Fitness coaches':'fitness center','Dental practices':'dentist','Med spas':'spa','Nutritionists':'nutritionist','Chiropractors':'chiropractor','Wellness clinics':'clinic','Dating coaches':'dating service','Matchmakers':'matchmaking','Couples counselors':'counselor','Wedding planners':'wedding planner','Relationship coaches':'counselor','Pizza restaurants':'pizza restaurant'};const term=terms[niche]||niche;const q=term+' near '+area+', United States';try{const data=await fetchJSON('https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&extratags=1&limit=40&q='+encodeURIComponent(q));return data.filter(x=>x.display_name).map(nominatimBusinessLead).filter(Boolean)}catch{return []}}
const regionalSearch=createRegionalSearch();
async function searchBusinesses(area,niche){area=String(area||'').trim().slice(0,120);if(area.length<2||!nicheTags[niche])throw Error('Enter a valid city or state and niche');const zipMatch=area.match(/(?:^|\D)(\d{5})(?:\D|$)/);const key=(area+'|'+niche).toLowerCase(),cached=searchCache.get(key);if(cached&&Date.now()-cached.at<30000&&cached.result.catalogSize===onlineCatalog.size)return {...cached.result,cached:true};// State-only requests use the complete published state index, not Nominatim's
// state-center bbox (which previously returned only one small metro).
if(resolveUSState(area)){
 const statewide=await regionalSearch.statewide({area,niche});
 if(statewide?.elements.length){indexResults(statewide.elements,area,niche);return {...statewide,area,niche,indexed:true}}
 const saved=indexedResults(area,niche);
 if(saved.length)return {elements:saved,area,niche,scope:'statewide',source:'Persisted OpenStreetMap source snapshot',cached:true,indexed:true,
  snapshotSources:statewide?.snapshotSources||[],searchStatus:'ok',
  coverage:'Older saved listings only. The regional state provider returned no qualifying listings or was unavailable.'};
 return {...statewide,area,niche};
}
const existing=indexedResults(area,niche);if(existing.length>=20)return {elements:existing,area,niche,source:'Persisted community-contributed business index',cached:true,indexed:true};let places;if(zipMatch){try{const z=await fetchJSON('https://api.zippopotam.us/us/'+zipMatch[1]);const loc=z.places?.[0];if(loc){const lat=Number(loc.latitude),lon=Number(loc.longitude);places=[{lat,lon,boundingbox:[lat-.18,lat+.18,lon-.22,lon+.22]}]}}catch{}}if(!places)places=await fetchJSON('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q='+encodeURIComponent(area+', United States'));if(!places.length){const indexed=indexedResults(area,niche);if(indexed.length)return {elements:indexed,area,niche,source:'Persisted business index',cached:true,indexed:true};throw Error('Location not found')}const p=places[0],bbox=p.boundingbox.map(Number);let [south,north,west,east]=bbox;if(north-south>.5||east-west>.5){south=Number(p.lat)-.09;north=Number(p.lat)+.09;west=Number(p.lon)-.12;east=Number(p.lon)+.12}const regional=await regionalSearch({lat:Number(p.lat),lon:Number(p.lon),bbox:[south,north,west,east],niche});if(regional.elements.length){indexResults(regional.elements,area,niche);return {...regional,area,niche,indexed:true}}const query='[out:json][timeout:10];(nwr'+nicheTags[niche]+'('+[south,west,north,east].join(',')+'););out center 80;';const endpoints=['https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter'];const snapshotMatches=indexedResults(area,niche);if(snapshotMatches.length){console.log('Business search completed',JSON.stringify({area,niche,count:snapshotMatches.length,source:'Maryland business index'}));return {elements:snapshotMatches,area,niche,source:'OpenStreetMap Maryland source snapshot',cached:true,indexed:true}}const fallbackPromise=nominatimFallback(area,niche);const independentPromise=Promise.race([wikidataPlaces(Number(p.lat),Number(p.lon),niche),new Promise((_,reject)=>setTimeout(()=>reject(Error('Independent provider timeout')),8500))]).catch(()=>[]);const attempts=endpoints.map((endpoint,i)=>fetchJSON(endpoint+'?data='+encodeURIComponent(query),{signal:AbortSignal.timeout(9000)}).then(data=>{if(!Array.isArray(data.elements))throw Error('Invalid provider response');return data}));let data,lastError;const outcomes=await Promise.allSettled(attempts);const good=outcomes.filter(x=>x.status==='fulfilled').map(x=>x.value);const valid=good.filter(x=>x.elements.some(el=>el.tags?.name));if(valid.length){const elements=new Map();for(const response of valid)for(const el of response.elements){if(el.tags?.name)elements.set(el.type+'/'+el.id,el)}data={elements:[...elements.values()]}}else{lastError={errors:outcomes.filter(x=>x.status==='rejected').map(x=>x.reason)};console.warn('Listing provider diagnostics',JSON.stringify({area,niche,providers:endpoints.map((endpoint,i)=>({host:new URL(endpoint).hostname,status:outcomes[i].status,count:outcomes[i].status==='fulfilled'?outcomes[i].value.elements.length:0,error:outcomes[i].status==='rejected'?String(outcomes[i].reason?.cause?.message||outcomes[i].reason?.message||outcomes[i].reason):null}))}))}if(!data){const independent=await independentPromise;const fallback=await fallbackPromise;const available=mergeSources(fallback,independent).elements;if(available.length){const model=trainWeakSupervision(available);const result={elements:available.map(el=>({...el,sourceCount:el.sourceAgreement?.length||1,mlScore:Math.round(sigmoid(model.weights.reduce((a,v,i)=>a+v*features(el.tags||{})[i],0))*100)})),area,niche,source:'Wikidata and Nominatim search fallback',independentAdded:independent.length,independentMatched:0,model:{method:model.method,trainingExamples:model.examples},cached:false};indexResults(result.elements,area,niche);searchCache.set(key,{at:Date.now(),result});return result}const indexed=indexedResults(area,niche);if(indexed.length)return {elements:indexed,area,niche,source:'Persisted business index',cached:true,indexed:true};return {elements:[],area,niche,source:'No verified listings retrieved',cached:false,indexed:false,searchStatus:'provider_unavailable',message:'No verified businesses could be retrieved. Live sources are unavailable; this does not mean no businesses exist.'}}let independent=await independentPromise;const merged=mergeSources(data.elements||[],independent);const model=trainWeakSupervision(merged.elements);for(const el of merged.elements){el.mlScore=Math.round(sigmoid(model.weights.reduce((a,v,i)=>a+v*features(el.tags||{})[i],0))*100);el.sourceCount=el.sourceAgreement.length}merged.elements.sort((a,b)=>(b.sourceCount-a.sourceCount)||(b.mlScore-a.mlScore));const result={elements:merged.elements,area,niche,source:'OpenStreetMap + independent Wikidata (when available)',independentAdded:merged.added,independentMatched:merged.matched,model:{method:model.method,trainingExamples:model.examples},cached:false};indexResults(result.elements,area,niche);searchCache.set(key,{at:Date.now(),result});if(searchCache.size>100)searchCache.delete(searchCache.keys().next().value);return result}
const runBusinessSearch=createSearchRunner(async(area,niche)=>{const result=await searchBusinesses(area,niche);return {...result,elements:(result.elements||[]).filter(row=>matchesIndexedNiche(row,niche,row.niches||[niche]))}});
const onlineNicheTerms={
 'Financial advisors':'financial|investment|wealth|asset management',
 'Real estate agents':'real estate|property',
 'Accountants':'accounting|bookkeeping|tax preparation',
 'Insurance agencies':'insurance',
 'Business coaches':'business coaching|business consulting|entrepreneur',
 'Marketing agencies':'marketing|advertising|digital agency',
 'Fitness coaches':'fitness|exercise|sportswear|gym',
 'Dental practices':'dental|dentist|oral care',
 'Med spas':'spa|beauty|skincare|cosmetic',
 'Nutritionists':'nutrition|supplement|healthy food|diet',
 'Chiropractors':'chiropractic|chiropractor',
 'Wellness clinics':'wellness|healthcare|health care',
 'Dating coaches':'dating|relationship',
 'Matchmakers':'matchmaking|dating',
 'Couples counselors':'counseling|therapy|relationship',
 'Wedding planners':'wedding|bridal',
 'Relationship coaches':'relationship|dating|counseling',
 'Red light therapy devices':'red light therapy|photobiomodulation|infrared light therapy|laser hair growth',
 'Pizza restaurants':'pizza restaurant|pizzeria'
};
const onlineCache=new Map();
const platformCache=new Map();
async function inspectBusinessWebsite(raw){
 let hostname;try{hostname=new URL(raw).hostname.toLowerCase()}catch{return {classification:'Unverified',platform:'Not verified',classificationEvidence:'Invalid website URL'}}
 const cached=platformCache.get(hostname);if(cached&&Date.now()-cached.at<86400000)return cached.result;
 let result={classification:'Unverified',platform:'Not verified',classificationEvidence:'Website not inspected'};
 try{
  // Reuse the restricted-host, DNS, response-size and redirect protections of get().
  const html=await get(raw);
  const shopify=/cdn\.shopify\.com|shopify\.theme|shopify-section|shopify-payment-button|shopify\.com\/s\/files/i.test(html);
  const woo=/wp-content\/plugins\/woocommerce(?:\/|[-.])|\bclass\s*=\s*["'][^"']*\b(?:woocommerce|wc-block-components)[\w-]*(?:\s|["'])/i.test(html);
  const commerce=/\badd to cart\b|\bcheckout\b|\bbuy now\b|\/cart(?:["'/?#]|\b)|product-form__submit/i.test(html);
  const booking=/\bbook online\b|\bvirtual consultation\b|\bonline appointment\b|\bonline course\b/i.test(html);
  const platform=shopify?'Shopify':woo?'WooCommerce':'Not verified';
  result={websiteReachable:true,classification:commerce||booking||shopify||woo?'Online':'Web presence',platform,classificationEvidence:shopify?'Public Shopify storefront assets':woo?'Public WooCommerce storefront assets':commerce?'Public checkout/cart wording':booking?'Public online booking or remote-service wording':'No strong online commerce or service evidence'};
 }catch(e){result.classificationEvidence='Website inspection unavailable: '+String(e.message).slice(0,90)}
 platformCache.set(hostname,{at:Date.now(),result});return result;
}
async function classifyElements(elements){
 const output=elements.map(el=>({...el,tags:{...el.tags}}));
 // Limit concurrent remote checks to avoid overloading public websites.
 let next=0;const workers=Array.from({length:4},async()=>{while(next<Math.min(output.length,24)){const i=next++,el=output[i],t=el.tags||{},site=t.website||t['contact:website'];const physical=Boolean(t['addr:street']||t['addr:housenumber']||t['addr:city']||el.lat||el.lon||el.center);
 if(!site){el.classification=physical?'Local':'Unverified';el.classificationEvidence=physical?'Mapped physical business presence':'No website or physical-location evidence';continue}
 const info=await inspectBusinessWebsite(site);el.platform=info.platform;el.classification=info.classification==='Online'?(physical?'Local + Online':'Online'):(physical?'Local':'Unverified');el.classificationEvidence=info.classificationEvidence;
 }});
 await Promise.all(workers);
 return output;
}

const ONLINE_CATALOG_FILE=join(STORE_DIR,'online-catalog.json');
const catalogStore=createCatalogStore(STORE_DIR);
const sharedSearchHistory=createSearchHistory(STORE_DIR);
const onlineCatalog=catalogStore.records;
let catalogReady=false,catalogRefreshActive=false;
function catalogDomain(raw){try{const u=new URL(raw);return ['http:','https:'].includes(u.protocol)?u.hostname.toLowerCase().replace(/^www\./,''):''}catch{return ''}}
async function loadOnlineCatalog(){await catalogStore.init();catalogReady=true}
let catalogWrite=Promise.resolve();
function saveOnlineCatalog(){return Promise.all([...onlineCatalog.values()].map(row=>catalogStore.save(row)))}
let discoveryNicheIndex=0;
let discoveryBackoffUntil=0;
const discoveryTerms={
 'Financial advisors':'wealth management firm','Real estate agents':'real estate company','Accountants':'accounting firm',
 'Insurance agencies':'insurance company','Business coaches':'business coaching company','Marketing agencies':'digital marketing agency',
 'Fitness coaches':'online fitness company','Dental practices':'dental care company','Med spas':'skin care company',
 'Nutritionists':'nutrition company','Chiropractors':'chiropractic company','Wellness clinics':'wellness company',
 'Dating coaches':'dating coaching company','Matchmakers':'matchmaking company','Couples counselors':'online therapy company',
 'Wedding planners':'wedding planning company','Relationship coaches':'relationship coaching company'
,
 'Red light therapy devices':'red light therapy company','Sauna blankets':'infrared sauna blanket company','Skin-care devices':'skin care devices company'};
const nationwideSearchOffsets=new Map();
async function discoverNationwideCandidates(){
 if(Date.now()<discoveryBackoffUntil)return;
 const niches=Object.keys(discoveryTerms),niche=niches[discoveryNicheIndex++%niches.length];
 try{
  // Wikimedia's indexed search is intended for keyword discovery; SPARQL is not.
  // Rotate result pages per niche to avoid rechecking the same first 50 businesses forever.
  const offset=nationwideSearchOffsets.get(niche)||0;
  const params=new URLSearchParams({action:'query',generator:'search',gsrsearch:discoveryTerms[niche]+' haswbstatement:P17=Q30 haswbstatement:P856',gsrnamespace:'0',gsrlimit:'50',gsroffset:String(offset),prop:'info',format:'json',origin:'*'});
  const search=await fetchJSON('https://www.wikidata.org/w/api.php?'+params,{signal:AbortSignal.timeout(12000),headers:{'user-agent':'LeadFlowResearch/1.0 (business discovery)'}});
  const ids=Object.values(search?.query?.pages||{}).map(page=>page.title).filter(title=>/^Q[0-9]+$/.test(title)).slice(0,50);
  if(!ids.length){nationwideSearchOffsets.set(niche,0);console.log('Nationwide discovery: exhausted search page',JSON.stringify({niche,offset}));return}
  nationwideSearchOffsets.set(niche,offset>=450?0:offset+50);
  const entities=await fetchJSON('https://www.wikidata.org/w/api.php?'+new URLSearchParams({action:'wbgetentities',ids:ids.join('|'),props:'claims|labels|descriptions',languages:'en',format:'json'}),{signal:AbortSignal.timeout(12000),headers:{'user-agent':'LeadFlowResearch/1.0 (business discovery)'}});
  let verified=0;
  const rejected={nonUS:0,missingWebsiteOrName:0,alreadyIndexed:0,notVerifiedOnline:0};
  for(const entity of Object.values(entities?.entities||{})){
   if(verified>=12)break;
   const claims=entity.claims||{};
   const us=claims.P17?.some(c=>c.mainsnak?.datavalue?.value?.id==='Q30');
   if(!us){rejected.nonUS++;continue}
   const website=claims.P856?.map(c=>c.mainsnak?.datavalue?.value).find(v=>typeof v==='string'&&/^https?:\/\//.test(v));
   const domain=catalogDomain(website),name=entity.labels?.en?.value;
   if(!domain||!name){rejected.missingWebsiteOrName++;continue}
   if(onlineCatalog.has(domain)){rejected.alreadyIndexed++;continue}
   const info=await inspectBusinessWebsite(website);
   if(!info.websiteReachable){rejected.notVerifiedOnline++;continue}
   const evidence='Wikidata US country statement and successful public website inspection';
   const element={type:'node',id:entity.id,tags:{name,website,description:entity.descriptions?.en?.value||''},classification:info.classification,platform:info.platform,classificationEvidence:info.classificationEvidence,usEvidence:evidence,independentSource:'https://www.wikidata.org/wiki/'+entity.id};
   const row={domain,niches:[niche],checkedAt:Date.now(),classification:info.classification,platform:info.platform,evidence:info.classificationEvidence,usEvidence:evidence,element};
   if(!supportsCatalogNiche(row,niche))continue;
   await catalogStore.save(row);verified++;
  }
  console.log('Nationwide discovery',JSON.stringify({niche,searchOffset:offset,candidates:ids.length,verified,rejected}));
 }catch(e){if(String(e.message).includes('429'))discoveryBackoffUntil=Date.now()+3600000;console.warn('Nationwide discovery skipped:',niche,e.message)}
}
function refreshQueueStatus(){const now=Date.now(),pending=new Map();for(const row of businessIndex.values()){const tags=row.element?.tags||{},website=tags.website||tags['contact:website'],domain=catalogDomain(website);if(!domain||pending.has(domain))continue;const checkedAt=Number(onlineCatalog.get(domain)?.checkedAt)||0;const ageDays=checkedAt?Math.max(0,Math.floor((now-checkedAt)/86400000)):null;if(ageDays===null||ageDays>=7)pending.set(domain,{domain,ageDays,priority:ageDays===null||ageDays>30?'high':'medium'});}const queue=[...pending.values()].sort((a,b)=>(a.ageDays===null?-1:b.ageDays===null?1:b.ageDays-a.ageDays)||a.domain.localeCompare(b.domain));return {pending:queue.length,highPriority:queue.filter(x=>x.priority==='high').length,mediumPriority:queue.filter(x=>x.priority==='medium').length,scheduledBatchSize:12,refreshIntervalMinutes:15,active:catalogRefreshActive,next:queue.slice(0,12)};}
async function refreshOnlineCatalog(){
 if(catalogRefreshActive)return;
 catalogRefreshActive=true;
 try{
  const rows=[...businessIndex.values()].filter(v=>v.element?.tags?.website||v.element?.tags?.['contact:website']).sort((a,b)=>{
   const ta=a.element?.tags||{},tb=b.element?.tags||{};
   return (onlineCatalog.get(catalogDomain(ta.website||ta['contact:website']))?.checkedAt||0)-(onlineCatalog.get(catalogDomain(tb.website||tb['contact:website']))?.checkedAt||0);
  });
  let inspected=0;
  for(const row of rows){
   if(inspected>=12)break;
   const el=row.element,t=el.tags||{},website=t.website||t['contact:website'],domain=catalogDomain(website);
   if(!domain)continue;
   const previous=onlineCatalog.get(domain);
   if(previous&&Date.now()-previous.checkedAt<7*86400000)continue;
   inspected++;
   const result=await inspectBusinessWebsite(website);
   const physical=Boolean(t['addr:street']||t['addr:city']||el.lat||el.lon||el.center);
   const classification=result.classification==='Online'?(physical?'Local + Online':'Online'):(physical?'Local':'Unverified');
   const record={domain,niches:[...new Set([...(previous?.niches||[]),...(row.niches||[])])],checkedAt:Date.now(),classification,platform:result.platform,evidence:result.classificationEvidence,usEvidence:'US mapped business record',element:{...el,tags:{...t,website},classification,platform:result.platform,classificationEvidence:result.classificationEvidence,usEvidence:'US mapped business record'}};
   onlineCatalog.set(domain,record);await catalogStore.save(record);
  }
  // A single bounded provider request per refresh avoids bursts and respects rate limits.
  await discoverNationwideCandidates();
 }catch(e){console.warn('Catalog refresh failed:',e.message)}finally{catalogRefreshActive=false}
}
const productMerchantSources={
 'Red light therapy devices':[
  // Each US address is checked against current first-party public evidence.
  {name:'Hooga',website:'https://hoogahealth.com/',officePage:'https://hoogahealth.com/pages/about',
   officePhrase:'New Berlin WI USA',officeLocation:'New Berlin, WI, USA',
   productPage:'https://hoogahealth.com/collections/red-light-therapy-devices'},
  {name:'Mito Red Light',website:'https://mitoredlight.com/',officePage:'https://mitoredlight.com/pages/contact-us',
   officePhrase:'Scottsdale AZ 85258',officeLocation:'Scottsdale, AZ, USA',
   productPage:'https://mitoredlight.com/collections/red-light-therapy'},
  {name:'iRESTORE',website:'https://www.irestorelaser.com/'}
 ],
 'Sauna blankets':[
  {name:'HigherDOSE',website:'https://higherdose.com/',officePage:'https://higherdose.com/pages/terms-conditions',
   officePhrase:'operated by HigherDOSE from its offices in New York',officeLocation:'New York, NY, USA',
   productPage:'https://higherdose.com/collections/infrared-sauna-collection'}
 ],
 'Skin-care devices':[{name:'CurrentBody',website:'https://www.currentbody.com/'}]
};
const productSeedRefresh=new Map();
async function verifyProductMerchants(niche){
 const merchants=productMerchantSources[niche];
 if(!merchants)return;
 if(Date.now()-(productSeedRefresh.get(niche)||0)<3600000)return;
 productSeedRefresh.set(niche,Date.now());
 for(const merchant of merchants){
  const domain=catalogDomain(merchant.website);
  if(!domain)continue;
  const previous=onlineCatalog.get(domain);
  if(previous&&Date.now()-Number(previous.checkedAt||0)<7*86400000&&previous.niches?.includes(niche)&&
     supportedUSCatalogRecord(previous)&&previous.productEvidencePage)continue;
  try{
   // Shipping to the US does not establish a US business location.
   if(!merchant.officePage||!sameMerchantHost(merchant.website,merchant.officePage)){
    console.log('Merchant qualification',JSON.stringify({domain,stage:'office_source_unavailable'}));
    continue;
   }
   const location=firstPartyMerchantLocation(merchant,await get(merchant.officePage,merchantSourceMaxBytes(merchants,merchant.officePage)));
   if(!location){
    console.log('Merchant qualification',JSON.stringify({domain,stage:'official_office_phrase_not_observed'}));
    continue;
   }
   let inspected=await inspectBusinessWebsite(merchant.website);
   if(inspected.classification!=='Online'&&merchant.productPage&&sameMerchantHost(merchant.website,merchant.productPage)){
    try{
     const html=await get(merchant.productPage,merchantSourceMaxBytes(merchants,merchant.productPage));
     const control=observedCommerceControl(html);
     if(control)inspected={classification:'Online',platform:'Not verified',
      classificationEvidence:'Observed '+control+' control on official product collection'};
    }catch(error){
     // Limit diagnostics to known error classes; never log response HTML, URLs,
     // user-provided keywords, headers, tokens or private credentials.
     const reason=String(error?.message||'');
     console.log('Merchant qualification',JSON.stringify({domain,stage:'product_collection_unavailable',
      reason:/Page too large/i.test(reason)?'size_limit':/Redirect disallowed/i.test(reason)?'redirect':/HTTP 404/i.test(reason)?'not_found':/abort|timeout/i.test(reason)?'timeout':'request_failed'}));
    }
   }
   if(inspected.classification!=='Online'){
    console.log('Merchant qualification',JSON.stringify({domain,stage:'public_ecommerce_signal_not_observed'}));
    continue;
   }
   const productEvidencePage=merchant.productPage&&sameMerchantHost(merchant.website,merchant.productPage)?merchant.productPage:undefined;
   const element={type:'node',id:'merchant-'+domain,tags:{name:merchant.name,website:merchant.website},
    classification:'Online',platform:inspected.platform,classificationEvidence:inspected.classificationEvidence,...location};
   const row={domain,niches:[...new Set([...(previous?.niches||[]),niche])],checkedAt:Date.now(),
    classification:'Online',platform:inspected.platform,evidence:inspected.classificationEvidence,
    productEvidencePage,...location,element};
   await catalogStore.save(row);
   onlineCatalog.set(domain,row);
   console.log('Merchant qualification',JSON.stringify({domain,stage:'catalog_evidence_persisted',locationKind:location.usEvidenceKind}));
  }catch(error){
   const reason=String(error?.message||'');
   console.warn('Merchant qualification',JSON.stringify({domain,stage:'official_source_unavailable',
    reason:/Page too large/i.test(reason)?'size_limit':/Redirect disallowed/i.test(reason)?'redirect':/HTTP 404/i.test(reason)?'not_found':/abort|timeout/i.test(reason)?'timeout':'request_failed'}));
  }
 }
}
async function searchIndexedOnlineBusinesses(niche){
 const records=[...onlineCatalog.values()].filter(v=>supportsCatalogNiche(v,niche)&&['Online','Local + Online'].includes(v.classification)).sort((a,b)=>(b.checkedAt||0)-(a.checkedAt||0));
 const elements=records.slice(0,100).map(v=>({...v.element,sourceAgreement:['Indexed US business','Observed public website signals']}));
 // Refresh outside the request path. Search latency is independent of website availability.
 void refreshOnlineCatalog();
 return {elements,niche,source:'LeadFlow cached online catalog',searchStatus:elements.length?'ok':'no_verified_matches',catalogSize:onlineCatalog.size,checkedAt:records.length?Math.max(...records.map(v=>v.checkedAt)):null,message:elements.length?'Results are based on previously inspected public websites.':'No qualifying cached online businesses yet. The background catalog refresh is still expanding coverage.'};
}
function normalizeProductQuery(value){return String(value||'').toLowerCase().trim().replace(/[^a-z0-9 -]/g,' ').replace(/\s+/g,' ').slice(0,90)}
const productKeywordGroups=[
 {terms:['red light therapy','red light','photobiomodulation','infrared therapy','hair growth laser'],niche:'Red light therapy devices'},
 {terms:['sauna blanket','infrared sauna blanket'],niche:'Sauna blankets'},
 {terms:['skin care device','skincare device','led face mask','facial device'],niche:'Skin-care devices'}
];
function productGroup(query){return productKeywordGroups.find(g=>g.terms.some(t=>query.includes(t)||t.includes(query)&&query.length>=5))}
async function lookupMerchantDomain(raw){
 const cleaned=String(raw||'').trim().replace(/^https?:\/\//i,'').replace(/\/.*$/,'').toLowerCase();
 if(!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(cleaned)||cleaned.length>253)throw Error('Enter a valid business website domain');
 const domain=cleaned.replace(/^www\./,'');
 const existing=onlineCatalog.get(domain);
 if(existing&&['Online','Local + Online'].includes(existing.classification)){
  return {elements:[existing.element],niche:domain,source:'Direct website lookup',searchStatus:'ok',catalogSize:onlineCatalog.size};
 }
 const website='https://'+domain;
 const info=await inspectBusinessWebsite(website);
 const name=domain.split('.')[0].replace(/[-_]/g,' ');
 const element={type:'node',id:'website-'+domain,tags:{name,website},classification:info.classification,
  platform:info.platform,classificationEvidence:info.classificationEvidence,usEvidence:'Location not independently verified'};
 if(info.classification==='Online'){
  const record={domain,niches:['Direct website lookup'],checkedAt:Date.now(),classification:'Online',platform:info.platform,
   evidence:info.classificationEvidence,usEvidence:element.usEvidence,element};
  onlineCatalog.set(domain,record);await catalogStore.save(record);
 }
 return {elements:[element],niche:domain,source:'Direct website lookup',searchStatus:info.classification==='Online'?'ok':'unverified',
  catalogSize:onlineCatalog.size,message:info.classification==='Online'?'Online storefront evidence detected.':'Website located, but ecommerce evidence could not be verified; the business is shown for review.'};
}
const productEvidenceCache=new Map();
async function searchProductKeyword(raw){
 const rawInput=String(raw||'').trim();
 if(/^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/?$/i.test(rawInput))return lookupMerchantDomain(rawInput);
 const query=normalizeProductQuery(raw);
 if(query.length<3)throw Error('Enter at least three characters for a product search');
 const group=productGroup(query);
 if(group&&productMerchantSources[group.niche])await verifyProductMerchants(group.niche);
 const tokens=query.split(' ').filter(w=>w.length>2);
 const records=[...onlineCatalog.values()].filter(r=>['Online','Local + Online'].includes(r.classification));
 const matches=[];
 // Old niche assignments are candidate hints, not evidence of a product or US location.
 const candidates=records.filter(supportedUSCatalogRecord).sort((a,b)=>Number(Boolean(group&&b.niches?.includes(group.niche)))-Number(Boolean(group&&a.niches?.includes(group.niche)))).slice(0,24);
 let nextProduct=0;await Promise.all(Array.from({length:6},async()=>{while(nextProduct<candidates.length){const r=candidates[nextProduct++];
  try{const sourceUrl=merchantProductPage(r),key=r.domain+'|'+query+'|'+sourceUrl;
   let evidence=productEvidenceCache.get(key);
   if(!evidence||Date.now()-evidence.retrievedAt>3600000){
    evidence={matches:productTextMatches(await get(sourceUrl,merchantSourceMaxBytes(group&&productMerchantSources[group.niche],sourceUrl)),query),sourceUrl,retrievedAt:Date.now(),method:'public_visible_product_phrase'};
    productEvidenceCache.set(key,evidence);while(productEvidenceCache.size>200)productEvidenceCache.delete(productEvidenceCache.keys().next().value);
   }
   if(evidence.matches)matches.push({...r,element:{...r.element,productEvidence:evidence}})
  }catch{}
 }}));
 const unique=[...new Map(matches.map(r=>[r.domain,r])).values()].slice(0,150);
 return {elements:unique.map(r=>({...r.element,sourceAgreement:[r.usEvidenceKind==='first_party_location_statement'?'Official merchant claims US office':'Public US business record','Inspected online storefront','Visible product keyword match']})),
  niche:query,source:'LeadFlow product keyword search',searchStatus:unique.length?'ok':'no_verified_matches',
  catalogSize:onlineCatalog.size,message:unique.length?'Matching storefronts with published product wording and US business-source evidence.':'No qualifying matches in this bounded catalog inspection. Product labels and US shipping alone do not verify product availability or a US business location.'};
}
async function searchOnlineBusinesses(niche){
 if(!onlineNicheTerms[niche]&&!discoveryTerms[niche])throw Error('Unsupported niche');
 if(productMerchantSources[niche])await verifyProductMerchants(niche);
 const cached=onlineCache.get(niche);if(cached&&Date.now()-cached.at<30000&&cached.result.catalogSize===onlineCatalog.size)return {...cached.result,cached:true};
 const indexed=await searchIndexedOnlineBusinesses(niche);onlineCache.set(niche,{at:Date.now(),result:indexed});return indexed;
 // Wikidata statements provide independently checkable US headquarters/country and official website.
 // No arbitrary web crawling, scraped search results, or guesses about Shopify hosting.
 const pattern=onlineNicheTerms[niche];
 const sparql='SELECT DISTINCT ?company ?companyLabel ?website ?description WHERE { ?company wdt:P856 ?website . { ?company wdt:P17 wd:Q30 . } UNION { ?company wdt:P159/wdt:P17 wd:Q30 . } OPTIONAL { ?company schema:description ?description FILTER(LANG(?description)="en") } OPTIONAL { ?company wdt:P452 ?industry . ?industry rdfs:label ?industryLabel FILTER(LANG(?industryLabel)="en") } FILTER(REGEX(LCASE(CONCAT(COALESCE(?description,"")," ",COALESCE(?industryLabel,""))), "'+pattern+'")) SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 70';
 const endpoint='https://query.wikidata.org/sparql?format=json&query='+encodeURIComponent(sparql);
 let response;try{response=await fetchJSON(endpoint,{signal:AbortSignal.timeout(6500),headers:{'accept':'application/sparql-results+json'}})}catch(error){console.warn('Online source unavailable:',error.message);return {elements:[],niche,source:'Online provider unavailable',searchStatus:'provider_unavailable',message:'No online-only results can be verified while the discovery provider is unavailable. Physical listings are excluded.'}};
 const seen=new Set(),elements=[];
 for(const row of response.results?.bindings||[]){
  const website=row.website?.value||'',name=row.companyLabel?.value||'',id=row.company?.value?.split('/').pop();
  if(!/^https?:\/\//i.test(website)||!name||!id||!/^Q\d+$/.test(id))continue;
  let host;try{host=new URL(website).hostname.toLowerCase().replace(/^www\./,'')}catch{continue}
  if(seen.has(host))continue;seen.add(host);
  elements.push({type:'wikidata',id,tags:{name,website,'addr:country':'US',description:row.description?.value||''},sourceAgreement:['Wikidata: US country or headquarters claim'],sourceCount:1,onlineCandidate:true,usEvidence:'Wikidata country or headquarters: United States',platform:'Not verified',classification:'Unverified'});
 }
 const classified=await classifyElements(elements);const result={elements:classified,niche,source:'Wikidata US-based website discovery',searchStatus:elements.length?'ok':'no_matches',message:elements.length?'US evidence is based on Wikidata claims; online operations and Shopify are marked only when website signals are found.':'No qualifying US businesses found in this free source for this niche.'};
 onlineCache.set(niche,{at:Date.now(),result});return result;
}
async function ingestSharedFeedback(data={}){const domain=String(data.domain||'').toLowerCase().replace(/^www\./,'');if(!/^[a-z0-9][a-z0-9.-]{1,250}[a-z0-9]$/.test(domain)||domain.includes('..'))return {accepted:false,reason:'invalid_domain'};const positive=data.positive,negative=data.negative;if(!Number.isSafeInteger(positive)||!Number.isSafeInteger(negative)||positive<0||negative<0||positive+negative===0||positive+negative>25)return {accepted:false,reason:'invalid_counts'};const row=onlineCatalog.get(domain);if(!row)return {accepted:false,reason:'unknown_catalog_domain'};const feedback={positive,negative,source:'Growth Lens user-reported outcomes',evidenceType:'unverified_feedback',updatedAt:Date.now()};try{await catalogStore.save({...row,sharedFeedback:feedback})}catch{return {accepted:false,reason:'persistence_failed',domain}}return {accepted:true,domain,evidenceType:feedback.evidenceType,storage:catalogStore.health().storage};}
function intelligenceRank(data={}){const terms=String(data.query||'').toLowerCase().trim().split(/\s+/).filter(x=>x.length>2).slice(0,8);const limit=Math.min(100,Math.max(1,Number(data.limit)||30));const matches=[...onlineCatalog.values()].filter(r=>['Online','Local + Online'].includes(r.classification)).map(r=>{const e=r.element||{},t=e.tags||{},body=[t.name,t.description,...(r.niches||[])].join(' ').toLowerCase();const keywordMatches=terms.filter(term=>body.includes(term)).length;const evidence=(r.evidence||e.classificationEvidence||'');const age=Number(r.checkedAt)>0?Math.max(0,Date.now()-Number(r.checkedAt)):Infinity;const freshnessPenalty=age>30*86400000?15:age>7*86400000?5:0;const score=Math.max(0,Math.min(100,25+Math.min(35,keywordMatches*12)+(r.platform&&r.platform!=='Not verified'?15:0)+(e.tags?.website?10:0)+(r.usEvidence&&!/not (?:independently )?verified|unknown|unverified/i.test(r.usEvidence)?10:0)+(evidence&&!/not inspected|not verified|unverified|unknown/i.test(evidence)?5:0)-freshnessPenalty));const feedback=r.sharedFeedback||null;const positive=Number.isSafeInteger(feedback?.positive)&&feedback.positive>=0?feedback.positive:0;const negative=Number.isSafeInteger(feedback?.negative)&&feedback.negative>=0?feedback.negative:0;const feedbackCount=Math.min(25,positive+negative);const feedbackAdjustment=feedbackCount?Math.round(8*((positive+2)/(positive+negative+4)-0.5)*Math.min(1,feedbackCount/5)):0;const priorityScore=Math.max(0,Math.min(100,score+feedbackAdjustment));const checkedAt=Number(r.checkedAt)||null;const ageDays=checkedAt?Math.max(0,Math.floor((Date.now()-checkedAt)/86400000)):null;const evidenceStatus=ageDays===null?'unknown':ageDays>30?'stale':'recent';return {name:t.name||r.domain,website:t.website||'',domain:r.domain,score,priorityScore,feedbackAdjustment,feedbackEvidenceType:feedbackCount?'user_reported_unverified':null,platform:r.platform||'Not verified',classification:r.classification,usEvidence:r.usEvidence||'',evidence,matchedTerms:keywordMatches,checkedAt,ageDays,evidenceStatus,freshnessPenalty,refreshPriority:evidenceStatus==='unknown'?'high':evidenceStatus==='stale'?'high':ageDays>7?'medium':'low',needsRefresh:evidenceStatus!=='recent',sharedFeedback:r.sharedFeedback||null}}).filter(r=>!terms.length||r.matchedTerms>0).sort((a,b)=>b.priorityScore-a.priorityScore||b.score-a.score||a.domain.localeCompare(b.domain)).slice(0,limit);return {engine:'LeadFlow evidence ranking v1',model:'Deterministic evidence scoring; not a trained neural network',query:String(data.query||'').slice(0,120),leads:matches,catalogSize:onlineCatalog.size,sources:['Wikidata','OpenStreetMap','public website inspection','Neon verified catalog'],refreshQueue:refreshQueueStatus(),generatedAt:new Date().toISOString()}}
function json(res,status,data,origin){res.writeHead(status,{'content-type':'application/json','access-control-allow-origin':allowedOrigin(origin)?origin:'null','access-control-allow-headers':'content-type, x-leadflow-token, authorization','access-control-allow-methods':'POST, OPTIONS, GET','cache-control':'no-store'});res.end(JSON.stringify(data))}
async function oauthBody(req){let raw='';for await(const part of req){raw+=part;if(raw.length>24000)throw Error('Request too large')}return JSON.parse(raw)}
http.createServer(async(req,res)=>{const origin=req.headers.origin||'';
 if(await serveFrontend(req,res))return;
 if(req.url.startsWith('/oauth/')){
  if(req.method==='OPTIONS'){json(res,204,{},origin);return}
  try{
   if(origin&&!allowedOrigin(origin)){json(res,403,{error:'Origin not allowed'},origin);return}
   const path=new URL(req.url,'http://localhost');
   if(req.method==='GET'&&path.pathname==='/oauth/start'){const destination=oauthStart(path.searchParams.get('provider'),path.searchParams.get('returnTo')||undefined);res.writeHead(302,{location:destination,'cache-control':'no-store'});res.end();return}
   if(req.method==='GET'&&path.pathname==='/oauth/callback'){const destination=await oauthCallback(path.searchParams);res.writeHead(302,{location:destination,'cache-control':'no-store'});res.end();return}
   if(req.method==='POST'&&path.pathname==='/oauth/exchange'){json(res,200,oauthExchange((await oauthBody(req)).ticket),origin);return}
   if(req.method==='POST'&&path.pathname==='/oauth/send'){const body=await oauthBody(req);json(res,200,await oauthSend(String(req.headers.authorization||'').replace(/^Bearer /,''),body),origin);return}
   if(req.method==='POST'&&path.pathname==='/oauth/disconnect'){oauthDisconnect(String(req.headers.authorization||'').replace(/^Bearer /,''));json(res,200,{disconnected:true},origin);return}
   json(res,404,{error:'Unknown OAuth route'},origin);return
  }catch(e){if(req.method==='GET'&&req.url.startsWith('/oauth/start')){const destination=ORIGIN+'/#oauth-error='+encodeURIComponent(e.message);res.writeHead(302,{location:destination,'cache-control':'no-store'});res.end();return}json(res,400,{error:e.message},origin);return}
 }
 if(req.method==='OPTIONS'){json(res,204,{},origin);return}if(req.url==='/health'){const knowledgeHealth=KNOWLEDGE_BASE_ENABLED?knowledgeHealthProbe.read():{storageReady:false,checking:false,checkedAt:null};json(res,200,{automation:{enabled:process.env.INTELLIGENCE_AUTOMATION_ENABLED==='true',outreachRequiresApproval:true},knowledgeBase:{...knowledgeHealth,enabled:KNOWLEDGE_BASE_ENABLED,mode:KNOWLEDGE_BASE_ENABLED?'opted-in':'disabled-until-explicit-opt-in'},leadLibrary:leadLibraryReady(),release:process.env.APP_COMMIT_SHA||null,status:'ok',research:true,draft:true,sending:!!(process.env.GOOGLE_OAUTH_CLIENT_ID&&process.env.GOOGLE_OAUTH_CLIENT_SECRET||process.env.MICROSOFT_OAUTH_CLIENT_ID&&process.env.MICROSOFT_OAUTH_CLIENT_SECRET),oauthProviders:{google:!!(process.env.GOOGLE_OAUTH_CLIENT_ID&&process.env.GOOGLE_OAUTH_CLIENT_SECRET),microsoft:!!(process.env.MICROSOFT_OAUTH_CLIENT_ID&&process.env.MICROSOFT_OAUTH_CLIENT_SECRET)},integrations:{pagespeed:{available:true,optionalKeyConfigured:!!process.env.PAGESPEED_API_KEY},hubspot:{configured:hubspotCRM.configured,manualOnly:true},officialRegistries:{freeSources:['NY Department of State','Colorado Secretary of State'],manualLookupsOnly:true},cmsNppes:{provider:'CMS NPPES',type:'Type 2 organizations',manualOnly:true,free:true}},indexedBusinesses:businessIndex.size,sharedIntelligence:{configured:!!process.env.SHARED_INTELLIGENCE_TOKEN,persistentCatalog:catalogStore.health().durable},onlineCatalog:{...catalogStore.health(),ready:catalogReady,verifiedOnline:[...onlineCatalog.values()].filter(v=>v.classification==='Online').length},onlineCatalogRefreshing:catalogRefreshActive,indexReady:businessIndex.size>0,financialAdvisors:[...businessIndex.values()].filter(v=>v.niches?.includes('Financial advisors')).length,nicheCoverage:Object.fromEntries(Object.keys(nicheTags).map(n=>[n,[...businessIndex.values()].filter(v=>v.niches?.includes(n)).length])),listingProviders:['overpass.kumi.systems','overpass-api.de','overpass.private.coffee']},origin);return}if(origin&&!allowedOrigin(origin)){json(res,403,{error:'Origin not allowed'},origin);return}if(!['/search','/search-online'].includes(req.url)&&!(TOKEN&&req.headers['x-leadflow-token']===TOKEN)&&!(req.url==='/intelligence'&&process.env.SHARED_INTELLIGENCE_TOKEN&&req.headers['x-leadflow-token']===process.env.SHARED_INTELLIGENCE_TOKEN)){json(res,401,{error:'API token required'},origin);return}const key=req.socket.remoteAddress||'unknown',now=Date.now(),h=(hits.get(key)||[]).filter(t=>now-t<60000);if(h.length>=LIMIT){json(res,429,{error:'Rate limit exceeded'},origin);return}h.push(now);hits.set(key,h);if(req.method!=='POST'||!['/enrich','/draft','/smart-draft','/search','/search-online','/website-audit','/crm','/registry','/healthcare-registry','/library','/intelligence','/knowledge','/automation','/forge/event'].includes(req.url)){json(res,404,{error:'Not found'},origin);return}try{let raw='';for await(const part of req){raw+=part;if(raw.length>(req.url==='/knowledge'?2000000:req.url==='/library'?262144:16000))throw Error('Request too large')}const data=JSON.parse(raw);if(req.url==='/forge/event'){if(!TOKEN||req.headers['x-leadflow-token']!==TOKEN){json(res,403,{error:'Private API token required'},origin);return}json(res,200,await forwardForgeEvent(data),origin);return}if(req.url==='/automation'&&(!TOKEN||req.headers['x-leadflow-token']!==TOKEN)){json(res,403,{error:'Private automation API token required'},origin);return}if(req.url==='/knowledge'&&(!TOKEN||req.headers['x-leadflow-token']!==TOKEN)){json(res,403,{error:'Private knowledge API token required'},origin);return}if(req.url==='/intelligence'&&['feedback-sync','feedback-probe','recent-searches','knowledge-search','knowledge-context','automation-status'].includes(data.action)&&(!process.env.SHARED_INTELLIGENCE_TOKEN||req.headers['x-leadflow-token']!==process.env.SHARED_INTELLIGENCE_TOKEN)){json(res,403,{error:'Shared intelligence token required'},origin);return}if(req.url==='/automation')console.info('Authenticated automation wake',JSON.stringify({trigger:['schedule','workflow_dispatch'].includes(data.trigger)?data.trigger:'unknown',workflowRunId:/^[0-9]{1,20}$/.test(String(data.workflowRunId||''))?String(data.workflowRunId):null,action:data.action==='run'?'run':'other'}));const result=req.url==='/automation'?await intelligenceAction(data.action,data):req.url==='/knowledge'?await knowledgeAction(data.action,data):req.url==='/intelligence'?(data.action==='feedback-probe'?{authorized:true,feedbackWriteAccess:true,persistentCatalog:catalogStore.health().durable}:data.action==='feedback-sync'?await ingestSharedFeedback(data):data.action==='recent-searches'?{searches:await sharedSearchHistory.recent(data.limit),persistent:sharedSearchHistory.health().durable}:data.action==='knowledge-search'?await knowledgeAction('search',{collection:data.collection,query:data.query}):data.action==='knowledge-context'?await knowledgeAction('context',{query:data.query,collection:data.collection}):data.action==='automation-status'?await intelligenceAction('status'):intelligenceRank(data)):req.url==='/library'?await libraryAction(TOKEN,data.action,data):req.url==='/website-audit'?await auditWebsiteWithPageSpeed((await validate(data.website)).href):req.url==='/registry'?(data.action==='lookup'?await officialRegistryLookup({name:data.name,state:data.state}):(()=>{throw Error('Unsupported public registry action')})()):req.url==='/healthcare-registry'?(data.action==='lookup'?await healthcareNpiLookup({name:data.name,state:data.state,city:data.city,niche:data.niche}):(()=>{throw Error('Unsupported healthcare registry action')})()):req.url==='/crm'?(data.action==='sync-company'?await (async()=>{await validate(data.company?.website);return hubspotCRM.sync(data.company)})():(()=>{throw Error('Unsupported CRM action')})()):req.url==='/search-online'?(data.productKeyword?await searchProductKeyword(data.productKeyword):await searchOnlineBusinesses(data.niche)):req.url==='/search'?await runBusinessSearch(data.area,data.niche):req.url==='/enrich'?await runResearch(data.website):req.url==='/smart-draft'?await smartDraft(data):draft(data);if(['/search','/search-online','/enrich'].includes(req.url))try{const elements=req.url==='/enrich'?[{website:result.website,name:result.company||''}]:result.elements||[];await sharedSearchHistory.record(elements)}catch(e){console.warn('Shared search history save failed:',e.message)}if(req.url==='/search')console.log('Business search completed',JSON.stringify({area:data.area,niche:data.niche,count:result.elements?.length||0,source:result.source,indexedBusinesses:businessIndex.size}));json(res,200,result,origin)}catch(e){console.error('API request failed',JSON.stringify({route:req.url,error:String(e.message||e)}));if(e.statusCode===503)res.setHeader('Retry-After','5');json(res,e.statusCode===503?503:400,{error:String(e.message||e)},origin)}}).listen(PORT,'0.0.0.0',()=>{
 console.log('LeadFlow backend listening on '+PORT);startIntelligenceScheduler();
 void initLeadLibrary().then(async ready=>{if(ready)console.log('Neon lead library verification',JSON.stringify(await verifyLeadLibrary()))});void loadOnlineCatalog().then(()=>refreshOnlineCatalog());void sharedSearchHistory.init();setInterval(()=>{void refreshOnlineCatalog()},15*60*1000).unref();
 if(process.env.LEADFLOW_LIVE_DIAGNOSTICS==='1'){
  (async()=>{
   const result={check:'startup-independent-leadership',company:'https://www.microsoft.com'};
   try{
    const response=await fetch('http://127.0.0.1:'+PORT+'/health',{signal:AbortSignal.timeout(4000)});
    const body=await response.json();result.healthStatus=response.status;result.indexedBusinesses=body.indexedBusinesses;
   }catch(e){result.healthError=e.message}
   try{
    const people=await wikidataLeadership(result.company);
    result.wikidataMatchedPeople=people.map(p=>({name:p.name,role:p.role,source:p.source,matchedWebsite:p.matchedWebsite}));
    result.wikidataStatus='ok';
   }catch(e){result.wikidataStatus='error';result.wikidataError=e.message}
   console.log('LeadFlow live diagnostics',JSON.stringify(result));
  })().catch(e=>console.error('LeadFlow live diagnostics error',e.message));
 }
});
