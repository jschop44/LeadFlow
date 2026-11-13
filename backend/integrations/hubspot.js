// Optional HubSpot CRM company handoff. Every write is triggered explicitly by the user.
// Configure HUBSPOT_ACCESS_TOKEN (Service Key or existing app token) in Render only.
// Credentials are never sent to the browser and this integration does NOT send outreach.
export function createHubSpotCompanySync({token=process.env.HUBSPOT_ACCESS_TOKEN||'',fetcher=fetch,timeoutMs=12000}={}){
 const configured=Boolean(token);
 async function request(path,method,body){
  if(!configured)throw Error('HubSpot CRM is not configured on the backend');
  let response;
  try{response=await fetcher('https://api.hubapi.com'+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)})}
  catch{throw Error('HubSpot CRM is unreachable')}
  if(!response.ok)throw Error(response.status===429?'HubSpot CRM rate limit reached':'HubSpot CRM request failed ('+response.status+')');
  return response.json();
 }
 function properties(company){
  const name=String(company?.name||'').trim().replace(/\s+/g,' ').slice(0,150);
  if(name.length<2)throw Error('Business name required for CRM handoff');
  let u;
  try{u=new URL(String(company.website||''))}catch{throw Error('Valid company website required for CRM handoff')}
  if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||u.hostname.endsWith('.local')||u.hostname.endsWith('.internal')||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname))throw Error('Public HTTPS company website required');
  const domain=u.hostname.toLowerCase().replace(/^www\./,'');
  const data={name,domain,website:u.origin};
  const phone=String(company.phone||'').trim().slice(0,55),city=String(company.city||'').trim().slice(0,100);
  if(phone)data.phone=phone;
  if(city)data.city=city;
  return data;
 }
 async function sync(company){
  const p=properties(company);
  // Matching by domain avoids duplicate companies on repeated manual sync.
  const found=await request('/crm/v3/objects/companies/search','POST',{filterGroups:[{filters:[{propertyName:'domain',operator:'EQ',value:p.domain}]}],properties:['name','domain'],limit:3});
  const results=found.results||[];
  if(results.length>1)throw Error('Multiple HubSpot companies match this domain; review in HubSpot');
  const result=results.length===1
   ?await request('/crm/v3/objects/companies/'+encodeURIComponent(String(results[0].id)),'PATCH',{properties:p})
   :await request('/crm/v3/objects/companies','POST',{properties:p});
  if(!result.id)throw Error('HubSpot did not confirm a company record');
  return {provider:'HubSpot CRM',recordType:'company',id:String(result.id),domain:p.domain,status:results.length?'updated':'created',message:'Company record synchronized by explicit user action. No emails sent.'};
 }
 return {configured,sync};
}
