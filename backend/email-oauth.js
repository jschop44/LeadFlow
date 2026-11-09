import {randomBytes,createHash} from 'node:crypto';
const FRONTEND=process.env.ALLOWED_ORIGIN||'https://leadflow-tp57.onrender.com';
const API=process.env.PUBLIC_API_ORIGIN||'https://leadflow-research-api.onrender.com';
const providers={
 google:{client:()=>process.env.GOOGLE_OAUTH_CLIENT_ID,secret:()=>process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',
  scope:'https://www.googleapis.com/auth/gmail.send',send:'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'},
 microsoft:{client:()=>process.env.MICROSOFT_OAUTH_CLIENT_ID,secret:()=>process.env.MICROSOFT_OAUTH_CLIENT_SECRET,
  authorize:'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  token:'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  scope:'offline_access Mail.Send User.Read',send:'https://graph.microsoft.com/v1.0/me/sendMail'}
};
const pending=new Map(),tickets=new Map(),sessions=new Map();
const accessExpiry=data=>Date.now()+Math.max(0,(Number(data.expires_in)||3000)*1000-60000);
const token=()=>randomBytes(32).toString('base64url');
const sha=s=>createHash('sha256').update(s).digest('base64url');
function cleanup(){const now=Date.now();for(const map of [pending,tickets,sessions])for(const [k,v] of map)if(v.expires<now)map.delete(k)}
function config(provider){const p=providers[provider];if(!p)throw Error('Unknown email provider');if(!p.client()||!p.secret())throw Error(provider+' OAuth credentials are not configured');return p}
async function postToken(p,params){const r=await fetch(p.token,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params),signal:AbortSignal.timeout(12000)});const data=await r.json();if(!r.ok||!data.access_token)throw Error('Email authorization failed');return data}
export function oauthStart(provider){cleanup();const p=config(provider),state=token(),verifier=token();pending.set(state,{provider,verifier,expires:Date.now()+600000});const u=new URL(p.authorize);u.searchParams.set('client_id',p.client());u.searchParams.set('redirect_uri',API+'/oauth/callback');u.searchParams.set('response_type','code');u.searchParams.set('scope',p.scope);u.searchParams.set('state',state);u.searchParams.set('code_challenge',sha(verifier));u.searchParams.set('code_challenge_method','S256');if(provider==='google'){u.searchParams.set('access_type','offline');u.searchParams.set('prompt','consent')}return u.toString()}
export async function oauthCallback(params){cleanup();const state=params.get('state'),record=pending.get(state);pending.delete(state);if(!record||!params.get('code'))throw Error('Invalid or expired authorization');const p=config(record.provider);const data=await postToken(p,{grant_type:'authorization_code',code:params.get('code'),client_id:p.client(),client_secret:p.secret(),redirect_uri:API+'/oauth/callback',code_verifier:record.verifier});const ticket=token();tickets.set(ticket,{provider:record.provider,data,accessExpiry:accessExpiry(data),expires:Date.now()+60000});return FRONTEND+'/#oauth-ticket='+encodeURIComponent(ticket)}
export function oauthExchange(ticket){cleanup();const record=tickets.get(ticket);tickets.delete(ticket);if(!record)throw Error('Authorization ticket expired');const id=token();sessions.set(id,{...record,expires:Date.now()+86400000});return {session:id,provider:record.provider}}
export function oauthDisconnect(id){sessions.delete(id)}
function encodeHeader(value){return String(value).replace(/[\r\n]/g,' ').trim()}
export async function oauthSend(id,{to,subject,body,confirm}){cleanup();const session=sessions.get(id);if(!session)throw Error('Connect your email account first');if(confirm!==true)throw Error('Explicit send confirmation required');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to||'')))throw Error('Valid recipient required');if(!subject||!body||String(subject).length>180||String(body).length>20000)throw Error('Invalid message');const p=config(session.provider);if(Date.now()>=session.accessExpiry){
  if(!session.data.refresh_token)throw Error('Reconnect your email account');
  if(!session.refreshing)session.refreshing=postToken(p,{grant_type:'refresh_token',refresh_token:session.data.refresh_token,client_id:p.client(),client_secret:p.secret()}).then(fresh=>{
   session.data={...session.data,...fresh,refresh_token:fresh.refresh_token||session.data.refresh_token};
   session.accessExpiry=accessExpiry(fresh);
  }).finally(()=>{session.refreshing=null});
  await session.refreshing;
 }
 const data=session.data;
 let endpoint=p.send,payload;
 if(session.provider==='google'){const raw=['To: '+encodeHeader(to),'Subject: =?UTF-8?B?'+Buffer.from(encodeHeader(subject),'utf8').toString('base64')+'?=','MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','',String(body)].join('\r\n');payload={raw:Buffer.from(raw).toString('base64url')}}
 else payload={message:{subject:String(subject),body:{contentType:'Text',content:String(body)},toRecipients:[{emailAddress:{address:String(to)}}]},saveToSentItems:true};
 const response=await fetch(endpoint,{method:'POST',headers:{authorization:'Bearer '+data.access_token,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Email provider rejected the message (HTTP '+response.status+'). No delivery was confirmed.');
 return {accepted:true,provider:session.provider,recipient:to,providerMessageId:session.provider==='google'?(await response.json()).id:null};
}
