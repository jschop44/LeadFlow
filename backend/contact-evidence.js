/**
 * Evidence-backed contact research on a business's own, robots-permitted pages.
 * No guessing, synthetic addresses, private contact data or social-platform scraping.
 */
const SOCIAL_HOSTS=['linkedin.com','facebook.com','instagram.com','x.com','twitter.com','youtube.com','tiktok.com'];
const ROLE_KEYS={founder:'Founder',founders:'Founder',ceo:'CEO',owner:'Owner',employee:'Team member',member:'Team member'};
const entityText=value=>String(value||'').replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi,(_,hex,decimal)=>{const num=parseInt(hex||decimal,hex?16:10);return num>0&&num<65536?String.fromCharCode(num):''}).replace(/&(?:commat|#64);/gi,'@').replace(/&(?:period|dot);/gi,'.').replace(/&amp;/gi,'&').replace(/&nbsp;/gi,' ');
const saneEmail=value=>{
 const raw=entityText(value).trim().replace(/^mailto:/i,'').split('?')[0].trim().replace(/^['"<]+|[>'",;:]+$/g,'');
 const email=raw.toLowerCase();
 if(email.length>254||!(/^[a-z0-9][a-z0-9._%+\-]{0,63}@[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?)+$/i).test(email))return '';
 if(/(?:example|invalid|test)\.(?:com|org|net|test)$/.test(email.split('@')[1])||/(?:sentry|webpack|noreply|no-reply|donotreply|do-not-reply)/i.test(email))return '';
 if(/\.(?:png|jpg|jpeg|webp|svg|gif|js|css)$/.test(email))return '';
 return email;
};
const cleanPhone=value=>{
 const raw=entityText(value).replace(/^tel:/i,'').split('?')[0].trim();
 const digits=raw.replace(/\D/g,'');
 if(!/^(?:1)?[2-9][0-9]{9}$/.test(digits))return '';
 return raw.slice(0,35);
};
const sameDomain=(a,b)=>{
 try{return new URL(a).hostname.toLowerCase().replace(/^www\./,'')===new URL(b).hostname.toLowerCase().replace(/^www\./,'')}catch{return false}
};
const siteDomain=website=>new URL(website).hostname.toLowerCase().replace(/^www\./,'');
const socialUrl=(value,source)=>{
 try{const u=new URL(entityText(value),source);if(u.protocol!=='https:'&&u.protocol!=='http:')return '';
 const host=u.hostname.toLowerCase();
 if(!SOCIAL_HOSTS.some(x=>host===x||host.endsWith('.'+x)))return '';
 if(!u.pathname||u.pathname==='/')return '';u.hash='';u.search='';
 return u.href;
 }catch{return ''}
};
const isOrgType=value=>{
 const types=Array.isArray(value)?value:[value];
 return types.some(t=>/^(?:https?:\/\/schema\.org\/)?(?:organization|corporation|localbusiness|restaurant|cafeorcoffeeshop|bakery|dentist|physician|store|financialservice|professionalservice|legalservice|accountingservice|realestateagent|travelagency|medicalclinic|healthandbeautybusiness|[a-z]+(?:business|store|restaurant|agency|office|service|practice|firm|clinic|dentist|attorney))$/i.test(String(t||'')));
};
const emailRe=/[a-z0-9._%+\-]+@[a-z0-9.-]+\.[a-z]{2,20}/gi;
const urls=html=>[...html.matchAll(/\bhref\s*=\s*["']([^"'<>\s]{1,1500})["']/gi)].map(x=>entityText(x[1]));
function schemaObjects(html){
 const nodes=[];
 for(const match of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{const parsed=JSON.parse(match[1]);const descend=(data,depth=0)=>{
   if(depth>6||!data)return;
   if(Array.isArray(data)){for(const item of data)descend(item,depth+1);return;}
   if(typeof data!=='object')return;
   if(isOrgType(data['@type']))nodes.push(data);
   if(data['@graph'])descend(data['@graph'],depth+1);
   if(data.mainEntity)descend(data.mainEntity,depth+1);
  };descend(parsed);
  }catch{}
 }
 return nodes;
}
function acceptedOrganization(org,root){
 const published=org.url||org['@id'];
 if(typeof published!=='string')return true;
 // A different organization's JSON-LD can be embedded in the same page.
 if(/^https?:\/\//i.test(published))return sameDomain(published,root);
 return true;
}
function visibleText(html){
 return entityText(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').slice(0,350000);
}
const nameOf=value=>{
 const name=typeof value==='string'?value:value?.name;
 if(typeof name!=='string')return '';
 const cleaned=entityText(name).replace(/\s+/g,' ').trim();
 if(!/^[\p{L}][\p{L} .,'’-]{3,89}$/u.test(cleaned)||!cleaned.includes(' '))return '';
 return cleaned;
};
export function extractPublicContacts(html,source,root=source){
 if(typeof html!=='string'||html.length>500000)throw Error('Public page exceeds contact parsing limit');
 const emailEvidence=[],phones=[],socials=[],namedContacts=[];
 const email=(raw,method,person='',role='')=>{
  const value=saneEmail(raw);if(!value)return;
  const domain=value.split('@')[1],host=siteDomain(root);
  emailEvidence.push({email:value,source,method,domainMatch:domain===host||domain.endsWith('.'+host),
   ...(person?{person,role}: {})});
 };
 const phone=raw=>{const value=cleanPhone(raw);if(value&&!phones.includes(value))phones.push(value)};
 const social=value=>{const link=socialUrl(value,source);if(link&&!socials.includes(link))socials.push(link)};
 for(const href of urls(html)){
  if(/^mailto:/i.test(href)){for(const item of href.replace(/^mailto:/i,'').split('?')[0].split(','))email(item,'mailto_link')}
  else if(/^tel:/i.test(href))phone(href);
  else social(href);
 }
 const text=visibleText(html);
 for(const item of text.match(emailRe)||[])email(item,'visible_business_page');
 for(const item of text.match(/(?:\+1[ .()-]?)?\(?[2-9]\d{2}\)?[ .-]?\d{3}[ .-]?\d{4}/g)||[])phone(item);
 // Only explicit, easily recognizable public obfuscation; no guessed addresses.
 for(const match of text.matchAll(/\b([a-z0-9._%+\-]{2,60})\s*(?:\[at\]|\(at\))\s*([a-z0-9\-]+(?:\s*(?:\[dot\]|\(dot\))\s*[a-z0-9\-]+){1,4})/gi)){
  email(match[1]+'@'+match[2].replace(/\s*(?:\[dot\]|\(dot\))\s*/gi,'.'),'published_obfuscated');
 }
 for(const org of schemaObjects(html)){
  if(!acceptedOrganization(org,root))continue;
  for(const value of [org.email])if(value)(Array.isArray(value)?value:[value]).forEach(x=>email(x,'organization_jsonld'));
  for(const value of [org.telephone])if(value)(Array.isArray(value)?value:[value]).forEach(phone);
  for(const value of [org.sameAs])if(value)(Array.isArray(value)?value:[value]).forEach(social);
  const points=Array.isArray(org.contactPoint)?org.contactPoint:[org.contactPoint];
  for(const point of points){if(!point||typeof point!=='object')continue;
   if(point.email)(Array.isArray(point.email)?point.email:[point.email]).forEach(v=>email(v,'organization_contact_point'));
   if(point.telephone)(Array.isArray(point.telephone)?point.telephone:[point.telephone]).forEach(phone);
  }
  // Record a named business email only when tied explicitly to a person in the
  // company's own Organization/LocalBusiness structured data.
  for(const [field,role] of Object.entries(ROLE_KEYS)){
   const entries=Array.isArray(org[field])?org[field]:[org[field]];
   for(const person of entries){if(!person||typeof person!=='object')continue;
    const personName=nameOf(person);if(!personName)continue;
    const addresses=Array.isArray(person.email)?person.email:[person.email];
    for(const address of addresses){const value=saneEmail(address);if(!value)continue;
     email(value,'named_company_jsonld',personName,role);
     namedContacts.push({name:personName,role,email:value,source,evidence:'Explicit company-published schema role and email; identity not independently verified'});
    }
   }
  }
 }
 return {emails:[...new Set(emailEvidence.map(x=>x.email))].slice(0,25),phones:phones.slice(0,12),
  socials:socials.slice(0,18),emailEvidence:emailEvidence.slice(0,80),namedContacts:namedContacts.slice(0,15)};
}
export function mergePublicContactEvidence(sources,website){
 const map=new Map(),phones=new Set(),socials=new Set(),people=[];
 const host=siteDomain(website);
 for(const page of sources){
  if(!page?.url||!sameDomain(page.url,website))continue;
  for(const p of page.phones||[])if(cleanPhone(p))phones.add(cleanPhone(p));
  for(const social of page.socials||[])if(socialUrl(social,page.url))socials.add(socialUrl(social,page.url));
  for(const contact of page.namedContacts||[]){
   if(!contact?.email||!saneEmail(contact.email)||!contact?.name||!contact?.role)continue;
   if(!people.some(x=>x.name===contact.name&&x.email===contact.email))people.push({...contact});
  }
  for(const item of page.emailEvidence||[]){
   const normalized=saneEmail(item.email);if(!normalized)continue;
   const existing=map.get(normalized)||{email:normalized,source:page.url,sources:[],methods:[],businessDomainMatch:normalized.split('@')[1]===host||normalized.split('@')[1].endsWith('.'+host)};
   if(!existing.sources.includes(page.url))existing.sources.push(page.url);
   if(item.method&&!existing.methods.includes(item.method))existing.methods.push(item.method);
   if(item.person&&item.role&&item.method==='named_company_jsonld'){existing.person=item.person;existing.role=item.role;}
   map.set(normalized,existing);
  }
 }
 const evidence=[...map.values()].map(v=>({...v,sourceCount:v.sources.length,
  classification:v.person?'named_company_published':v.businessDomainMatch?'company_domain_published':'external_domain_published',
  note:'Published on company website; ownership, deliverability and current employment not independently verified.'}));
 evidence.sort((a,b)=>Number(Boolean(b.person))-Number(Boolean(a.person))||Number(b.businessDomainMatch)-Number(a.businessDomainMatch)||b.sourceCount-a.sourceCount||a.email.localeCompare(b.email));
 return {emails:evidence.map(x=>x.email).slice(0,25),emailEvidence:evidence.slice(0,25),
  phones:[...phones].slice(0,12),socials:[...socials].slice(0,18),namedContacts:people.slice(0,15)};
}
export function discoverContactPages(html,site,limit=5){
 const root=new URL(site).origin,found=[],weights={contact:8,about:7,team:6,leadership:9,management:7,staff:6,people:5,founder:8,owner:7,'our-story':5};
 for(const href of urls(html)){
  let u;try{u=new URL(href,site)}catch{continue}
  if(!sameDomain(u.href,root)||!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&& !['80','443'].includes(u.port))continue;
  if(u.search||u.pathname==='/'||/\.(?:pdf|png|jpg|jpeg|webp|gif|svg|docx?|zip)$/i.test(u.pathname))continue;
  const path=u.pathname.replace(/\/+$/,'');
  if(path.length>90||path.split('/').length>5||/\/(?:login|account|admin|cart|checkout|user|api|wp-admin)(?:\/|$)/i.test(path))continue;
  const slug=path.split('/').filter(Boolean).pop()?.toLowerCase()||'';
  const key=Object.keys(weights).find(term=>slug.includes(term));if(!key)continue;
  if(!found.some(x=>x.path===path))found.push({path,score:weights[key]});
 }
 return found.sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)).slice(0,Math.max(0,Math.min(8,limit))).map(x=>x.path);
}
