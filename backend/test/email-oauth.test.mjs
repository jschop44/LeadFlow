import test from 'node:test';
import assert from 'node:assert/strict';
import {oauthStart,oauthCallback,oauthExchange,oauthSend,oauthDisconnect} from '../email-oauth.js';

test('Gmail expiry is measured at token issuance, refresh is coalesced, and sending does not extend token life',async()=>{
 const oldFetch=globalThis.fetch,oldNow=Date.now,oldClient=process.env.GOOGLE_OAUTH_CLIENT_ID,oldSecret=process.env.GOOGLE_OAUTH_CLIENT_SECRET;
 let now=1000000,refreshes=0,sends=0,session;
 Date.now=()=>now;process.env.GOOGLE_OAUTH_CLIENT_ID='test-client';process.env.GOOGLE_OAUTH_CLIENT_SECRET='test-secret';
 const tokens=[];
 globalThis.fetch=async(url,options)=>{
  if(String(url).includes('/token')){
   const refreshing=options.body.get('grant_type')==='refresh_token';if(refreshing)refreshes++;
   return Response.json({access_token:refreshing?'refreshed-'+refreshes:'initial',refresh_token:'test-refresh',expires_in:3600});
  }
  assert.match(String(url),/^https:\/\/gmail.googleapis.com\//);sends++;tokens.push(options.headers.authorization);
  const mime=Buffer.from(JSON.parse(options.body).raw,'base64url').toString('utf8');assert.match(mime,/Subject: =\?UTF-8\?B\?/);
  return Response.json({id:'message-'+sends});
 };
 try{
  assert.throws(()=>oauthStart('google','https://untrusted.example'),/destination/);
  assert.throws(()=>oauthStart('google','https://jschop44.github.io/OtherApp/'),/destination/);
  const pagesStart=new URL(oauthStart('google','https://jschop44.github.io/LeadFlow/'));
  const pagesRedirect=new URL(await oauthCallback(new URLSearchParams({state:pagesStart.searchParams.get('state'),code:'pages-code'})));
  assert.equal(pagesRedirect.origin,'https://jschop44.github.io');
  assert.equal(pagesRedirect.pathname,'/LeadFlow/');
  const pagesTicket=new URLSearchParams(pagesRedirect.hash.slice(1)).get('oauth-ticket');
  oauthDisconnect(oauthExchange(pagesTicket).session);
  const start=new URL(oauthStart('google','https://leadflow-research-api.onrender.com/app'));assert.equal(start.searchParams.get('code_challenge_method'),'S256');
  const callback=new URL(await oauthCallback(new URLSearchParams({state:start.searchParams.get('state'),code:'test-code'})));
  assert.equal(callback.pathname,'/app');
  const ticket=new URLSearchParams(callback.hash.slice(1)).get('oauth-ticket');session=oauthExchange(ticket).session;
  assert.throws(()=>oauthExchange(ticket),/expired/);
  const message={to:'recipient@example.com',subject:'Café website idea',body:'Test fixture only',confirm:true};
  await assert.rejects(oauthSend(session,{...message,confirm:false}),/confirmation/);assert.equal(sends,0);
  now+=1800000;assert.equal((await oauthSend(session,message)).accepted,true);assert.equal(refreshes,0);
  now+=1800000;await Promise.all([oauthSend(session,message),oauthSend(session,message)]);assert.equal(refreshes,1);
  assert.deepEqual(tokens,['Bearer initial','Bearer refreshed-1','Bearer refreshed-1']);
  now+=1800000;await oauthSend(session,message);assert.equal(refreshes,1);
  now+=1800000;await oauthSend(session,message);assert.equal(refreshes,2);
  oauthDisconnect(session);await assert.rejects(oauthSend(session,message),/Connect/);
 }finally{
  if(session)oauthDisconnect(session);globalThis.fetch=oldFetch;Date.now=oldNow;
  for(const [key,value] of [['GOOGLE_OAUTH_CLIENT_ID',oldClient],['GOOGLE_OAUTH_CLIENT_SECRET',oldSecret]])if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
