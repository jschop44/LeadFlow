/** Rotate bounded product inspections across the verified US catalog.
 * An old fixed slice(0,24) permanently excluded all subsequent businesses.
 * A niche is a scheduling hint, never proof that any product is offered.
 */
export function productInspectionWindow(records,niche,query,cursors,limit=24){
 const budget=Math.min(24,Math.max(1,Math.trunc(Number(limit)||24)));
 const preferred=niche?records.filter(row=>row.niches?.includes(niche)):[];
 const general=niche?records.filter(row=>!row.niches?.includes(niche)):records;
 const window=(pool,wanted,group)=>{
  if(!pool.length||wanted<=0)return [];
  const key=query+'|'+group;
  const start=(cursors.get(key)||0)%pool.length;
  const count=Math.min(pool.length,wanted);
  const chosen=Array.from({length:count},(_,i)=>pool[(start+i)%pool.length]);
  cursors.delete(key);
  cursors.set(key,(start+count)%pool.length);
  while(cursors.size>200)cursors.delete(cursors.keys().next().value);
  return chosen;
 };
 const preferredQuota=niche&&general.length?Math.min(12,budget):budget;
 const result=window(preferred,preferredQuota,'preferred');
 result.push(...window(general,budget-result.length,'general'));
 if(result.length<budget){
  const selectedDomains=new Set(result.map(row=>row.domain));
  const remaining=preferred.filter(row=>!selectedDomains.has(row.domain));
  result.push(...window(remaining,budget-result.length,'remaining-preferred'));
 }
 return result;
}
