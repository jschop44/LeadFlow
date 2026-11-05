import {createHmac,randomUUID} from 'node:crypto';
export async function forwardForgeEvent(input){
 const url=process.env.FORGE_EVENT_URL||'',secret=process.env.FORGE_INTEGRATION_SECRET||'';
 if(!url.startsWith('https://')||secret.length<32)throw Error('Forge Studio integration not configured');
 if(input.consent!==true)throw Error('Explicit business data sharing consent is required');
 const tenantId=String(input.tenantId||''),businessName=String(input.businessName||'').trim();
 if(!/^[0-9a-f-]{36}$/i.test(tenantId)||businessName.length<2||businessName.length>120)throw Error('Invalid tenant or business');
 const event={eventId:randomUUID(),tenantId,source:'leadflow',businessName,consent:true};
 if(input.website)event.website=String(input.website).slice(0,2048);
 if(input.summary)event.summary=String(input.summary).slice(0,3000);
 const raw=JSON.stringify(event),timestamp=String(Date.now()),signature=createHmac('sha256',secret).update(timestamp+'.'+raw).digest('hex');
 const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-forge-timestamp':timestamp,'x-forge-signature':signature},body:raw,signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Forge Studio rejected signed event ('+response.status+')');
 return response.json();
}
