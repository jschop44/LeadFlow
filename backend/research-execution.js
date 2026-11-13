/** Small free-tier research budget: no unbounded queue or cached contact data. */
export async function mapConcurrent(items,concurrency,worker){
 if(!Number.isInteger(concurrency)||concurrency<1)throw Error('Invalid concurrency');
 const results=new Array(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
  while(next<items.length){const index=next++;results[index]=await worker(items[index],index)}
 }));
 return results;
}
export function createResearchRunner(research,capacity=2,{now=Date.now,cacheTtlMs=0,maxCached=120}={}){
 const pending=new Map(),cache=new Map();
 return function run(website){
  const key=String(website);
  const saved=cache.get(key);
  if(saved&&saved.until>now())return Promise.resolve({...structuredClone(saved.value),cached:true});
  if(pending.has(key))return pending.get(key);
  if(pending.size>=capacity){const error=Error('Research capacity reached; retry shortly');error.statusCode=503;return Promise.reject(error)}
  const operation=Promise.resolve().then(()=>research(website)).then(result=>{
   if(cacheTtlMs>0&&result&&typeof result==='object'){
    cache.delete(key);cache.set(key,{value:structuredClone(result),until:now()+cacheTtlMs});
    while(cache.size>maxCached)cache.delete(cache.keys().next().value);
   }
   return result;
  }).finally(()=>pending.delete(key));
  pending.set(key,operation);return operation;
 };
}
