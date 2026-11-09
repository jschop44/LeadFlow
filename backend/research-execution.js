/** Small free-tier research budget: no unbounded queue or cached contact data. */
export async function mapConcurrent(items,concurrency,worker){
 if(!Number.isInteger(concurrency)||concurrency<1)throw Error('Invalid concurrency');
 const results=new Array(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
  while(next<items.length){const index=next++;results[index]=await worker(items[index],index)}
 }));
 return results;
}
export function createResearchRunner(research,capacity=2){
 const pending=new Map();
 return function run(website){
  const key=String(website);
  if(pending.has(key))return pending.get(key);
  if(pending.size>=capacity){const error=Error('Research capacity reached; retry shortly');error.statusCode=503;return Promise.reject(error)}
  const operation=Promise.resolve().then(()=>research(website)).finally(()=>pending.delete(key));
  pending.set(key,operation);return operation;
 };
}
