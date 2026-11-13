/** Serial, bounded public endpoint pacing. Never bypass provider quotas or rotate identities. */
export function createHostPacer({minIntervalMs=1100,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),maxEntries=200,ttlMs=21600000}={}){
 let chain=Promise.resolve(),nextAllowed=0;
 const cached=new Map(),inflight=new Map();
 return function request(key,work){
  const id=String(key||'');
  const prior=cached.get(id);
  if(prior&&prior.expires>now())return Promise.resolve(structuredClone(prior.value));
  if(inflight.has(id))return inflight.get(id).then(structuredClone);
  const task=chain.catch(()=>{}).then(async()=>{
   const current=now();
   if(nextAllowed>current)await sleep(nextAllowed-current);
   nextAllowed=now()+minIntervalMs;
   const result=await work();
   cached.delete(id);
   cached.set(id,{expires:now()+ttlMs,value:structuredClone(result)});
   while(cached.size>maxEntries)cached.delete(cached.keys().next().value);
   return result;
  });
  chain=task.then(()=>{},()=>{});
  inflight.set(id,task);
  task.then(()=>inflight.delete(id),()=>inflight.delete(id));
  return task;
 };
}
