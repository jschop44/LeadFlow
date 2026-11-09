import {createResearchRunner} from './research-execution.js';
/** Share simultaneous searches; avoid hammering unavailable public providers. */
export function createSearchRunner(search,{now=Date.now,unavailableTtlMs=15000,capacity=2}={}){
 const unavailable=new Map();
 const execute=createResearchRunner(async key=>{
  const [area,niche]=JSON.parse(key);
  const result=await search(area,niche);
  if(result?.searchStatus==='provider_unavailable'){
   unavailable.delete(key);unavailable.set(key,{until:now()+unavailableTtlMs,result});
   while(unavailable.size>100)unavailable.delete(unavailable.keys().next().value);
  }
  return result;
 },capacity);
 return (area,niche)=>{
  if(typeof area!=='string'||typeof niche!=='string'||area.trim().length<2||area.length>120||niche.length>80)return Promise.reject(Error('Enter a valid city, state or ZIP and business niche'));
  const key=JSON.stringify([area.trim().toLowerCase(),niche.trim()]);
  const hit=unavailable.get(key);
  if(hit&&hit.until>now())return Promise.resolve({...hit.result,cached:true,retryAfterSeconds:Math.max(1,Math.ceil((hit.until-now())/1000))});
  unavailable.delete(key);return execute(key);
 };
}
