// Server-only Forge Studio event forwarding for Cloudflare Workers.
export async function forwardForgeEvent(request,env){
 if(!env.FORGE_EVENT_URL?.startsWith('https://')||!env.FORGE_INTEGRATION_SECRET||env.FORGE_INTEGRATION_SECRET.length<32)return new Response(JSON.stringify({error:'Forge integration disabled'}),{status:503,headers:{'content-type':'application/json'}});
 try{
 const raw=await request.text();if(raw.length>16000)throw Error('Payload too large');
 const data=JSON.parse(raw);if(data.consent!==true||!data.tenantId||!data.businessName)throw Error('Consent, tenant and business name required');
 const event={eventId:crypto.randomUUID(),tenantId:String(data.tenantId),source:'leadflow',businessName:String(data.businessName).slice(0,120),consent:true};
 if(data.website)event.website=String(data.website).slice(0,2048);
 if(data.summary)event.summary=String(data.summary).slice(0,3000);
 const body=JSON.stringify(event),timestamp=String(Date.now()),encoder=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',encoder.encode(env.FORGE_INTEGRATION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await crypto.subtle.sign('HMAC',key,encoder.encode(timestamp+'.'+body));
 const signature=Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
 const response=await fetch(env.FORGE_EVENT_URL,{method:'POST',headers:{'content-type':'application/json','x-forge-timestamp':timestamp,'x-forge-signature':signature},body});
 return new Response(await response.text(),{status:response.status,headers:{'content-type':'application/json'}});
 }catch(error){return new Response(JSON.stringify({error:String(error.message||error)}),{status:400,headers:{'content-type':'application/json'}})}
}
