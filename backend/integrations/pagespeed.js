// Google PageSpeed Insights: an optional, free-tier read-only website audit.
// No API key is needed for occasional requests; set PAGESPEED_API_KEY for higher quotas.
// Caller must validate the target hostname against the backend SSRF policy first.
const TTL=6*60*60*1000;
export function createPageSpeedAuditor({fetcher=fetch,apiKey=process.env.PAGESPEED_API_KEY||'',now=Date.now,timeoutMs=28000}={}){
 const cache=new Map(),inflight=new Map();
 return async function auditWebsite(website){
  const target=new URL(website);
  if(target.protocol!=='https:'||target.username||target.password||target.port||!target.hostname.includes('.'))throw Error('Public HTTPS website required');
  const site=target.origin+target.pathname;
  const cached=cache.get(site);
  if(cached&&now()-cached.at<TTL)return {...cached.data,cached:true};
  if(inflight.has(site))return inflight.get(site);
  const task=(async()=>{
   const endpoint=new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
   endpoint.searchParams.set('url',site);
   endpoint.searchParams.set('strategy','mobile');
   for(const category of ['performance','accessibility','best-practices','seo'])endpoint.searchParams.append('category',category);
   if(apiKey)endpoint.searchParams.set('key',apiKey);
   let response;
   try{response=await fetcher(endpoint.toString(),{headers:{accept:'application/json'},signal:AbortSignal.timeout(timeoutMs)})}
   catch{throw Error('PageSpeed Insights did not respond')}
   if(!response.ok)throw Error(response.status===429?'PageSpeed Insights quota reached':'PageSpeed Insights unavailable ('+response.status+')');
   const raw=await response.json(),lhr=raw.lighthouseResult;
   if(!lhr?.categories)throw Error('PageSpeed Insights returned no Lighthouse audit');
   const scores={};
   for(const [field,key] of Object.entries({performance:'performance',accessibility:'accessibility',bestPractices:'best-practices',seo:'seo'})){
    const score=lhr.categories[key]?.score;
    scores[field]=typeof score==='number'&&Number.isFinite(score)?Math.round(Math.max(0,Math.min(1,score))*100):null;
   }
   if(Object.values(scores).every(x=>x===null))throw Error('PageSpeed Insights returned no scored categories');
   const opportunities=Object.entries(lhr.audits||{}).filter(([id,a])=>a&&typeof a.score==='number'&&a.score<.85&&a.scoreDisplayMode!=='notApplicable'&&a.title&&id!=='final-screenshot').sort((a,b)=>a[1].score-b[1].score).slice(0,5).map(([id,a])=>({id,title:String(a.title).slice(0,140),detail:String(a.displayValue||'').slice(0,140),score:Math.round(a.score*100)}));
   const data={provider:'Google PageSpeed Insights / Lighthouse',website:site,strategy:'mobile',scores,opportunities,analyzedAt:new Date(now()).toISOString(),cached:false,note:'Lab observations about the public website, not a prediction of lead conversion or business revenue.'};
   cache.set(site,{at:now(),data});
   if(cache.size>200)cache.delete(cache.keys().next().value);
   return data;
  })();
  inflight.set(site,task);
  try{return await task}finally{inflight.delete(site)}
 };
}
