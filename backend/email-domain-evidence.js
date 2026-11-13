/**
 * Bounded DNS evidence for published business email domains.
 * MX records show domain mail routing, not mailbox ownership or deliverability.
 * Never issue SMTP requests or guess addresses.
 */
import dns from 'node:dns/promises';

const domainOf=value=>{
 const text=String(value||'').trim().toLowerCase(),at=text.lastIndexOf('@');
 if(at<=0)return null;
 const domain=text.slice(at+1);
 if(domain.length>253||!(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)))return null;
 return domain;
};
export function createMailDomainInspector({resolver=dns,now=Date.now,maxDomains=8,maxConcurrent=3,timeoutMs=1400,cacheTtlMs=3600000}={}){
 const cache=new Map(),pending=new Map();
 async function check(domain){
  const stored=cache.get(domain);
  if(stored?.expires>now())return stored.value;
  if(pending.has(domain))return pending.get(domain);
  const promise=(async()=>{
   let status='dns_unavailable',exchanges=0,description='Public mail-routing lookup unavailable; mailbox status unknown.';
   let timer;
   try{
    const result=await Promise.race([
     Promise.resolve().then(()=>resolver.resolveMx(domain)),
     new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('DNS timeout'),{code:'TIMEOUT'})),timeoutMs);timer.unref?.()})
    ]);
    const records=Array.isArray(result)?result:[];
    if(records.some(r=>r?.priority===0&&['.',''].includes(r.exchange))){status='null_mx';description='Domain explicitly declares no inbound email (null MX).';}
    else if(records.some(r=>typeof r?.exchange==='string'&&r.exchange.trim()&&r.exchange!=='.')){
     status='mx_present';exchanges=Math.min(records.length,20);
     description='Domain publishes MX records; this does not establish mailbox deliverability or who owns an address.';
    }else{status='no_mx_observed';description='No usable MX records observed; SMTP may use address records as fallback.'}
   }catch(error){
    if(['ENODATA','ENOTFOUND','ENODOMAIN'].includes(error?.code)){
     status=error.code==='ENOTFOUND'||error.code==='ENODOMAIN'?'domain_not_found':'no_mx_observed';
     description=status==='domain_not_found'?'DNS reports the email domain does not exist.':'No MX records found; SMTP address-record fallback may still be possible.';
    }
   }finally{if(timer)clearTimeout(timer);}
   const value={status,exchanges,description,checkedAt:new Date(now()).toISOString(),source:'public DNS MX records'};
   cache.delete(domain);cache.set(domain,{value,expires:now()+cacheTtlMs});
   while(cache.size>200)cache.delete(cache.keys().next().value);
   return value;
  })();
  pending.set(domain,promise);
  try{return await promise;}finally{pending.delete(domain)}
 }
 return async function inspect(emails=[]){
  const names=[...new Set((Array.isArray(emails)?emails:[]).map(x=>domainOf(typeof x==='string'?x:x?.email)).filter(Boolean))].slice(0,maxDomains);
  const result={},concurrency=Math.min(maxConcurrent,names.length);
  let index=0;
  await Promise.all(Array.from({length:concurrency},async()=>{
   while(index<names.length){const domain=names[index++];result[domain]=await check(domain)}
  }));
  return result;
 };
}
export const mailDomainInspector=createMailDomainInspector();
export function applyMailDomainEvidence(rows,domains={}){
 const array=Array.isArray(rows)?rows:[];
 const result=array.map((row,index)=>{
  const domain=domainOf(row?.email);
  const evidence=domain?domains[domain]:null;
  return {...row,mailDomain:evidence||{status:'not_checked',description:'Mail domain not checked; mailbox ownership and deliverability unknown.'},_stableIndex:index};
 });
 const bad=new Set(['null_mx','domain_not_found']);
 result.sort((a,b)=>Number(bad.has(a.mailDomain.status))-Number(bad.has(b.mailDomain.status))||a._stableIndex-b._stableIndex);
 return result.map(({_stableIndex,...row})=>row);
}
