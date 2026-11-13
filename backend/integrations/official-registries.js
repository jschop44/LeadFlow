/** Free focused US entity-registry lookups. Public filings do not prove lead identity or ownership. */
import {createHostPacer} from '../provider-pacing.js';
const DEFINITIONS={
 NY:{state:'New York',host:'data.ny.gov',id:'n9v6-gdp6',field:'current_entity_name',select:'dos_id,current_entity_name,entity_type,chairman_name,county'},
 CO:{state:'Colorado',host:'data.colorado.gov',id:'4ykn-tg5h',field:'entityname',select:'entityid,entityname,entitystatus,entitytype,agentfirstname,agentmiddlename,agentlastname,agentorganizationname,principalcity,principalstate'}
};
export function registryState(value){
 const state=String(value||'').trim().toUpperCase();
 return state==='NY'||state==='NEW YORK'?'NY':state==='CO'||state==='COLORADO'?'CO':null;
}
export function exactRegistryQuery(name,definition){
 const clean=String(name||'').trim().replace(/\s+/g,' ').slice(0,145);
 if(clean.length<3||!/^[\p{L}\p{N} &.,'()\-]+$/u.test(clean))throw Error('Enter an exact legal company name for registry verification');
 const url=new URL('https://'+definition.host+'/resource/'+definition.id+'.json');
 url.searchParams.set('$where','upper('+definition.field+") = '"+clean.toUpperCase().replace(/'/g,"''")+"'");
 url.searchParams.set('$select',definition.select);
 url.searchParams.set('$limit','5');
 return {url,name:clean};
}
const safeName=value=>{
 const v=String(value||'').replace(/\s+/g,' ').trim();
 return v.length>=3&&v.length<145?v:'';
};
function transform(row,state){
 if(state==='NY'){
  const company=safeName(row.current_entity_name);if(!company)return null;
  const officer=safeName(row.chairman_name);
  return {legalName:company,recordId:String(row.dos_id||'').slice(0,30),entityType:String(row.entity_type||'').slice(0,80),
   cityOrCounty:String(row.county||'').slice(0,80),
   publicRole:officer?{name:officer,role:'CEO name as recorded by NY Department of State',verifiedOwner:false}:null};
 }
 const company=safeName(row.entityname);if(!company)return null;
 const agent=safeName([row.agentfirstname,row.agentmiddlename,row.agentlastname].filter(Boolean).join(' '))||safeName(row.agentorganizationname);
 return {legalName:company,recordId:String(row.entityid||'').slice(0,30),entityType:String(row.entitytype||'').slice(0,80),
  stateOfRecord:'CO',cityOrCounty:String(row.principalcity||'').slice(0,80),entityStatus:String(row.entitystatus||'').slice(0,70),
  publicRole:agent?{name:agent,role:'Registered agent (not necessarily an owner or officer)',verifiedOwner:false}:null};
}
export function createOfficialRegistryLookup({fetcher=fetch,now=Date.now,timeoutMs=12000}={}){
 const pace=createHostPacer({minIntervalMs:1100,now,ttlMs:6*3600000,maxEntries:120});
 return async function lookup({name,state}={}){
  const code=registryState(state);
  if(!code)throw Error('Free official registry adapter currently supports New York (NY) and Colorado (CO)');
  const definition=DEFINITIONS[code],{url,name:company}=exactRegistryQuery(name,definition);
  const query=url.toString();
  let rows;
  try{
   rows=await pace(query,async()=>{
    const response=await fetcher(query,{redirect:'error',signal:AbortSignal.timeout(timeoutMs),
     headers:{accept:'application/json','user-agent':'LeadFlow/1.0 (public company registry; contact: project leadflow)'}});
    if(!response.ok)throw Error('Official registry returned HTTP '+response.status);
    if(Number(response.headers.get('content-length')||0)>200000)throw Error('Official registry response exceeds limit');
    const text=await response.text();
    if(text.length>200000)throw Error('Official registry response exceeds limit');
    const data=JSON.parse(text);
    if(!Array.isArray(data)||data.length>5)throw Error('Invalid official registry response');
    return data;
   });
  }catch{throw Error('Official '+definition.state+' registry unavailable; no legal entity match could be verified')}
  const records=rows.map(row=>transform(row,code)).filter(x=>x&&x.legalName.toUpperCase()===company.toUpperCase());
  return {source:definition.state+' official open-data business registry',state:code,
   dataset:'https://'+definition.host+'/d/'+definition.id,
   status:records.length?'possible_legal_name_match':'no_exact_legal_name_match',
   legalNameQueried:company,matches:records,
   checkedAt:new Date(now()).toISOString(),coverage:code==='NY'?'Active corporation snapshot, updated periodically':'Colorado entity filings snapshot, including inactive entities',
   note:'Name-only candidate matching. Government filings do not establish that this web lead is the same legal entity. CEO and registered agent roles are not proof of beneficial ownership or current employment. No personal addresses or emails returned.'};
 };
}
