const FALLBACK='https://growthlens-free-test.onrender.com';
const ideas=[
 ['contact','make contacting your team easier','a clearer contact path can help interested visitors reach you'],
 ['lead_capture','make it easier for visitors to request information','a focused inquiry form can reduce friction for potential customers'],
 ['primary_action','make the next step more prominent','a clear primary call to action can guide visitors toward contacting you'],
 ['navigation','simplify the path to important services','clear navigation can help visitors find the right service faster'],
 ['mobile','improve the mobile browsing experience','mobile-friendly pages can make it easier for visitors to engage'],
 ['meta_description','improve how your services appear in search results','a clear page description can better communicate your offer'],
 ['structured_data','clarify business details for search engines','relevant structured data can help search engines understand your services'],
 ['trust','make customer confidence signals easier to find','visible trust signals may help visitors feel more confident'],
 ['faq','answer common questions before a customer reaches out','a concise FAQ can reduce uncertainty and repetitive inquiries']
];
export function auditOpportunity(audit,service){
 const findings=Array.isArray(audit?.findings)?audit.findings:[];
 const failures=findings.filter(x=>x&&x.passed===false&&typeof x.id==='string');
 const selected=ideas.map(([id,action,reason])=>({id,action,reason,finding:failures.find(f=>f.id===id||f.id.includes(id))})).find(x=>x.finding);
 if(!selected)return {verified:false,reason:'No relevant verified audit finding available',score:typeof audit?.score==='number'?audit.score:null};
 return {verified:true,id:selected.id,action:selected.action,reason:selected.reason,finding:selected.finding.name||selected.id,source:audit.url||null,score:typeof audit.score==='number'?audit.score:null,service:String(service||'').trim()};
}
export function personalizedDraft({business,contact,service,sender,unsubscribe},opportunity){
 if(!business||!service||!sender||!unsubscribe)throw Error('Business, offer, sender and opt-out instructions required');
 const name=String(contact||'').trim()||'there';
 const subject='A website idea for '+business;
 const paragraph=opportunity?.verified
  ?'I reviewed the publicly accessible website for '+business+' and noticed an opportunity around '+opportunity.finding.toLowerCase()+'. One possible improvement is to '+opportunity.action+'. '+opportunity.reason.charAt(0).toUpperCase()+opportunity.reason.slice(1)+'.'
  :'I came across '+business+' and wanted to share a possible website improvement idea. I have not verified a specific issue with your website.';
 const body='Hi '+name+',\n\n'+paragraph+'\n\nI offer '+service+'. If useful, I can share a brief, practical suggestion tailored to your business. Would you be open to that?\n\n'+sender+'\n\nTo opt out: '+unsubscribe;
 return {subject,text:body,opportunity:opportunity||{verified:false},status:'draft_only',sendingEnabled:false};
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
