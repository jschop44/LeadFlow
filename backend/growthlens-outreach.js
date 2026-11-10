const FALLBACK='https://growthlens-free-test.onrender.com';
const ideas=[
 ['secure_forms','secure the destination used by website forms','an approved HTTPS destination protects form submissions in transit'],
 ['mixed_content','secure embedded website resources','HTTPS resource links can avoid blocked content'],
 ['contact','make contacting your team easier','a clearer contact path can help interested visitors reach you'],
 ['lead_capture','make it easier for visitors to request information','a focused inquiry form can reduce friction for potential customers'],
 ['primary_action','make the next step more prominent','a clear primary call to action can guide visitors toward contacting you'],
 ['navigation','simplify the path to important services','clear navigation can help visitors find the right service faster'],
 ['mobile','improve the mobile browsing experience','mobile-friendly pages can make it easier for visitors to engage'],
 ['meta_description','improve how your services appear in search results','a clear page description can better communicate your offer'],
 ['structured_data','clarify business details for search engines','relevant structured data can help search engines understand your services'],
 ['trust','make customer confidence signals easier to find','visible trust signals may help visitors feel more confident'],
 ['conversion_cta','make the next step more prominent','a clear call to action can guide visitors toward the right service'],
 ['image_dimensions','reserve space for images as they load','stable image layouts can reduce content movement'],
 ['accessible_links','give website links clear accessible names','clear link names help visitors navigate with assistive technology'],
 ['blocking_scripts','defer noncritical scripts after checking dependencies','reducing render-blocking scripts may help page content appear sooner'],
 ['main_landmark','identify the primary page content for assistive technology','a main landmark helps visitors navigate directly to the page content'],
 ['schema_validity','repair malformed structured business data','valid JSON-LD helps search engines parse the business details you provide'],
 ['faq','answer common questions before a customer reaches out','a concise FAQ can reduce uncertainty and repetitive inquiries']
];
export function auditOpportunity(audit,service,ranking=[]){
 const findings=Array.isArray(audit?.findings)?audit.findings:[];
 if(typeof audit?.url!=='string'||!/^https?:\/\//i.test(audit.url))return {verified:false,reason:'Audit source URL unavailable'};
 const failures=findings.filter(x=>x&&x.passed===false&&typeof x.id==='string');
 const priorities=new Map();
 for(const item of Array.isArray(ranking)?ranking.slice(0,100):[]){
  if(typeof item?.finding_id==='string'&&!priorities.has(item.finding_id))priorities.set(item.finding_id,priorities.size);
 }
 const candidates=ideas.map(([id,action,reason],fallback)=>({id,action,reason,fallback,finding:failures.find(f=>f.id===id)})).filter(x=>x.finding);
 candidates.sort((a,b)=>Number(['secure_forms','mixed_content'].includes(b.id))-Number(['secure_forms','mixed_content'].includes(a.id))||
  (priorities.get(a.id)??1000)-(priorities.get(b.id)??1000)||a.fallback-b.fallback);
 const selected=candidates[0];
 if(!selected)return {verified:false,reason:'No relevant verified audit finding available',score:typeof audit?.score==='number'?audit.score:null};
 return {verified:true,id:selected.id,action:selected.action,reason:selected.reason,finding:selected.finding.name||selected.id,source:audit.url||null,score:typeof audit.score==='number'?audit.score:null,service:String(service||'').trim(),recommendation:String(selected.finding.recommendation||'').slice(0,350),evidenceMethod:selected.finding.evidence?.method||'single_page_audit',contextDependent:/context dependent/i.test(selected.finding.category||'')};
}
export function personalizedDraft({business,contact,service,sender,unsubscribe,niche,location},opportunity){
 if(!business||!service||!sender||!unsubscribe)throw Error('Business, offer, sender and opt-out instructions required');
 const clean=(value,max=300)=>String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
 business=clean(business,160);service=clean(service,500);sender=clean(sender,500);unsubscribe=clean(unsubscribe,300);
 const name=clean(contact,80)||'there';
 const context=[clean(niche,100),clean(location,140)].filter(Boolean).join(' in ');
 const contextLine=context?' Your '+context+' business caught my attention.':'';
 const subject='A website idea for '+business;
 const paragraph=opportunity?.verified
  ?'I reviewed the publicly accessible website for '+business+' and noticed an opportunity around '+opportunity.finding.toLowerCase()+'. One possible improvement is to '+opportunity.action+'. '+opportunity.reason.charAt(0).toUpperCase()+opportunity.reason.slice(1)+'.'+(opportunity.recommendation?' Suggested next step: '+clean(opportunity.recommendation,350):'')
  :'I came across '+business+' and wanted to share a possible website improvement idea. I have not verified a specific issue with your website.';
 const body='Hi '+name+',\n\n'+paragraph+contextLine+'\n\nI offer '+service+'. If useful, I can share a brief, practical suggestion tailored to your business. Would you be open to that?\n\n'+sender+'\n\nTo opt out: '+unsubscribe;
 const socialText='Hi '+name+', I came across '+business+(context?' ('+context+')':'')+'. '+(opportunity?.verified?'I reviewed your website and noticed an opportunity to '+opportunity.action+'. '+(opportunity.recommendation?'A practical next step: '+clean(opportunity.recommendation,200)+' ':''):'')+'I offer '+service+'. Would a brief suggestion be useful? — '+sender+'. Opt out: '+unsubscribe;
 return {subject,text:body,socialText,opportunity:opportunity||{verified:false},status:'draft_only',sendingEnabled:false};
}
export async function growthLensAudit(website){
 const base=(process.env.GROWTHLENS_API_URL||FALLBACK).replace(/\/+$/,'');
 if(!['https://growthlens-free-test.onrender.com'].includes(base))throw Error('Unapproved Growth Lens endpoint');
 const secret=process.env.GROWTHLENS_PRIVATE_KEY;
 if(!secret)throw Error('Growth Lens integration not configured');
 const response=await fetch(base+'/api/audits',{method:'POST',headers:{'content-type':'application/json','X-GrowthLens-Key':secret},body:JSON.stringify({url:website}),signal:AbortSignal.timeout(55000)});
 if(!response.ok)throw Error('Growth Lens audit unavailable (HTTP '+response.status+')');
 return response.json();
}

// Coalesce email/DM draft audits and keep both concurrency and residency bounded.
export function createAuditCache(load,{ttlMs=600000,maxEntries=100,now=Date.now}={}){
 const cache=new Map(),pending=new Map();
 return async website=>{
  const key=new URL(website).origin;
  const hit=cache.get(key);if(hit&&hit.expires>now())return hit.value;
  if(pending.has(key))return pending.get(key);
  if(pending.size>=10)throw Error('Audit capacity is busy; try again shortly');
  const work=Promise.resolve().then(()=>load(key)).then(value=>{
   if(value?.status==='completed'){
    cache.delete(key);cache.set(key,{value,expires:now()+ttlMs});
    while(cache.size>maxEntries)cache.delete(cache.keys().next().value);
   }
   return value;
  }).finally(()=>pending.delete(key));
  pending.set(key,work);return work;
 };
}
