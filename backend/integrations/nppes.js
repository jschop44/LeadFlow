/**
 * Free, focused CMS NPPES organization-record checks.
 * This uses only Type 2 NPI organizations, never individual clinician records.
 * Public NPI records are not credential, employment or beneficial-owner verification.
 */
import {createHostPacer} from '../provider-pacing.js';
const ENDPOINT='https://npiregistry.cms.hhs.gov/api/';
const HEALTH_NICHES=new Set(['Dental practices','Chiropractors','Nutritionists','Wellness clinics','Med spas']);
const STATE_CODES=new Set(('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY').split(' '));
const normalizeName=value=>String(value||'').toLowerCase().replace(/&/g,' and ').replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\s+/g,' ').trim();
const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
const nonempty=(value,max=120)=>clean(value).slice(0,max);
const orgName=record=>clean(record?.basic?.organization_name||'');
function publishedNameMatch(record,query){
 const legalName=orgName(record),expected=normalizeName(query);
 if(legalName&&normalizeName(legalName)===expected)return {kind:'exact_legal_business_name',nameUsed:legalName,currentStatus:'not_independently_verified'};
 const others=Array.isArray(record?.other_names)?record.other_names:[];
 for(const item of others){
  const alias=clean(item?.organization_name||'');
  if(!alias||normalizeName(alias)!==expected)continue;
  const type=clean(item?.type||item?.type_code||item?.code||'').toLowerCase();
  if(type==='4'||type.includes('former'))continue; // historical names cannot establish current identity
  if(type==='3'||type==='dba'||type.includes('doing business as'))return {kind:'exact_registered_dba',nameUsed:alias,currentStatus:'public_record_only'};
  if(type==='5'||type.includes('other'))return {kind:'exact_registered_other_name',nameUsed:alias,currentStatus:'current_use_unknown'};
 }
 return null;
}
export function isHealthcareNiche(niche){return HEALTH_NICHES.has(niche)}
export function nppesQuery({name,state,city}={}){
 const company=clean(name);
 if(company.length<4||company.length>120||!(/^[\p{L}\p{N} &.,'()\-]+$/u.test(company)))throw Error('Enter a specific healthcare business name');
 const code=clean(state).toUpperCase();
 if(code&&(!/^[A-Z]{2}$/.test(code)||!STATE_CODES.has(code)))throw Error('Select a valid two-letter US state code');
 const town=clean(city);
 if(town&&(town.length>70||!(/^[\p{L}\p{N} .'\-]+$/u.test(town))))throw Error('Invalid city name');
 const url=new URL(ENDPOINT);
 url.searchParams.set('version','2.1');
 url.searchParams.set('enumeration_type','NPI-2');
 url.searchParams.set('organization_name',company);
 if(code)url.searchParams.set('state',code);
 if(town)url.searchParams.set('city',town);
 url.searchParams.set('limit','20');
 return {url,company,code,town};
}
const validNpi=value=>/^\d{10}$/.test(String(value||''));
function organizationRecord(record,name,state,city){
 if(!record||record.enumeration_type!=='NPI-2'||!validNpi(record.number)||record.basic?.status==='D'||record.basic?.status==='Deactivated')return null;
 const legalName=orgName(record),nameMatch=publishedNameMatch(record,name);
 if(!legalName||!nameMatch)return null;
 const primary=Array.isArray(record.addresses)?record.addresses.filter(a=>a?.address_purpose==='LOCATION'):[];
 // CMS can publish additional clinic practice sites separate from the primary location.
 const additional=Array.isArray(record.practiceLocations)?record.practiceLocations:[];
 const addresses=[...primary.map(a=>({...a,sourceType:'primary_practice'})),...additional.map(a=>({...a,sourceType:'additional_practice'}))].filter(a=>a&&(!state||clean(a.state).toUpperCase()===state)&&(!city||normalizeName(a.city)===normalizeName(city)));
 if(!addresses.length)return null;
 const location=addresses[0];
 const officialName=[record.basic?.authorized_official_first_name,record.basic?.authorized_official_last_name].map(clean).filter(Boolean).join(' ');
 const title=nonempty(record.basic?.authorized_official_title_or_position,90);
 const taxonomy=(Array.isArray(record.taxonomies)?record.taxonomies:[]).filter(x=>x?.desc&&typeof x.desc==='string').slice(0,6).map(x=>({description:nonempty(x.desc),primary:x.primary===true}));
 return {npi:String(record.number),legalName,city:nonempty(location.city),state:nonempty(location.state,2),
  practicePhone:/^(?:\+1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]?[2-9]\d{2}[\s.-]?\d{4}$/.test(clean(location.telephone_number))?nonempty(location.telephone_number,30):null,
  specialties:taxonomy,recordUpdated:nonempty(record.basic?.last_updated,24)||null,
  authorizedOfficial:officialName.length>=4&&title?{name:nonempty(officialName),title,role:'Authorized official named in NPPES (not necessarily the owner)',verifiedOwner:false}:null,
  source:ENDPOINT+'?version=2.1&number='+record.number,
  matching:{organizationName:nameMatch.kind,nameUsed:nameMatch.nameUsed,nameCurrentStatus:nameMatch.currentStatus,practiceLocation:state?'state_and'+(city?'_city':'_name'):'name_only',practiceSource:location.sourceType}};
}
export function createNppesLookup({fetcher=fetch,now=Date.now,timeoutMs=10000}={}){
 // CMS limits hourly API use; do not conduct bulk discovery through this endpoint.
 const paced=createHostPacer({minIntervalMs:2000,ttlMs:12*3600000,maxEntries:100,now});
 return async function lookup({name,state,city,niche}={}){
  if(!isHealthcareNiche(niche))throw Error('NPPES organization lookup is intended for healthcare business niches only');
  const {url,company,code,town}=nppesQuery({name,state,city});
  let payload;
  try{
   payload=await paced(url.href,async()=>{
    const response=await fetcher(url.href,{redirect:'error',signal:AbortSignal.timeout(timeoutMs),
     headers:{accept:'application/json','user-agent':'LeadFlowBusinessResearch/1.0 (CMS public organization lookup)'}});
    if(!response.ok)throw Error('CMS NPPES returned HTTP '+response.status);
    if(Number(response.headers.get('content-length')||0)>400000)throw Error('NPPES response too large');
    const body=await response.text();
    if(body.length>400000)throw Error('NPPES response too large');
    const parsed=JSON.parse(body);
    if(parsed.Errors?.length||!Array.isArray(parsed.results)||parsed.results.length>20)throw Error('NPPES provider rejected lookup or returned invalid results');
    return parsed;
   });
  }catch{throw Error('CMS NPPES lookup is unavailable; cannot verify organization matches')}
  const matches=payload.results.map(x=>organizationRecord(x,company,code,town)).filter(Boolean);
  return {provider:'CMS NPPES National Provider Identifier Registry',dataset:'https://npiregistry.cms.hhs.gov/',
   queriedOrganization:company,queriedState:code||null,queriedCity:town||null,
   status:matches.length?'possible_organization_matches':'no_exact_organization_match',matches,
   checkedAt:new Date(now()).toISOString(),sourceType:'federal_public_organization_directory',
   note:'NPI records are self-reported public registry data. Type 2 organization entries are not proof of professional licensing, credentialing, legal ownership, current employment or equivalence to the business lead. A published DBA or other-name match must be manually reconciled with the lead; former legal names are excluded. Authorized officials are NOT necessarily owners. No personal addresses, clinician records or personal emails returned.'};
 };
}
