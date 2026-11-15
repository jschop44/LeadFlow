/** Public, read-only exact-revision verification of the deployed LeadFlow API.
 * Never send authentication tokens or initiate outbound messages.
 */
import {pathToFileURL} from 'node:url';

export const LIVE_API='https://leadflow-research-api.onrender.com';

export async function verifyLiveRevision(expectedSha,{
 fetcher=globalThis.fetch,
 base=LIVE_API,
 attempts=18,
 pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
 intervalMs=10000,
}={}){
 if(!/^[a-f0-9]{40}$/i.test(expectedSha))throw Error('Invalid expected release commit');
 if(base!==LIVE_API)throw Error('Live verification is restricted to the known LeadFlow API');
 if(!Number.isInteger(attempts)||attempts<1||attempts>24)throw Error('Invalid probe budget');
 let observed='unavailable';
 for(let i=0;i<attempts;i++){
  try{
   const response=await fetcher(base+'/health',{
    redirect:'error',headers:{accept:'application/json'},
    signal:AbortSignal.timeout(16000)
   });
   if(response.ok){
    const health=await response.json();
    if(health?.status==='ok'&&typeof health.release==='string'){
     observed=health.release.slice(0,40);
     if(health.release===expectedSha){
      // A live response alone is insufficient if a release has accidentally
      // disabled private-route protection. Send an *unauthenticated*, inert
      // request; a correct release rejects it without sending anything.
      const privateRoute=await fetcher(base+'/enrich',{
       method:'POST',redirect:'error',
       headers:{'content-type':'application/json'},
       body:'{}',signal:AbortSignal.timeout(16000)
      });
      if(privateRoute.status!==401)throw Error('Live enrichment authorization check failed');
      return {status:'verified',release:expectedSha,health:'ok',unauthenticatedEnrichStatus:401,attempts:i+1};
     }
    }
   }
  }catch(error){
   if(error?.message==='Live enrichment authorization check failed')throw error;
  }
  if(i+1<attempts)await pause(intervalMs);
 }
 throw Error('Live API did not serve the expected verified revision (observed '+observed+').');
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const expectedSha=process.argv[2]||'';
 verifyLiveRevision(expectedSha).then(result=>{
  console.log(JSON.stringify(result));
 }).catch(error=>{
  console.error('LeadFlow exact live release verification failed:',error.message);
  process.exitCode=1;
 });
}
