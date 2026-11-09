import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export async function wakeIntelligence({token,event='workflow_dispatch',runId='',fetcher=fetch,now=Date.now}){
 if(!token?.trim())throw Error('LEADFLOW_AUTOMATION_TOKEN is required');
 if(!['schedule','workflow_dispatch','push'].includes(event))throw Error('Unsupported workflow event');
 if(!/^\d{1,20}$/.test(runId))throw Error('Invalid workflow run ID');
 const started=now();
 const response=await fetcher('https://leadflow-research-api.onrender.com/automation',{
  method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-LeadFlow-Token':token},
  body:JSON.stringify({action:'run',trigger:event,workflowRunId:runId}),signal:AbortSignal.timeout(100000)
 });
 if(!response.ok)throw Error('Intelligence wake returned HTTP '+response.status);
 const result=await response.json();
 if(result?.enabled!==true||result.error)throw Error('Intelligence cycle disabled or failed');
 const deferred=result.running===true||result.skipped===true;
 const lastRun=Date.parse(result.lastRun);
 // An old timestamp or an empty success response is not evidence of a completed cycle.
 if(!deferred&&(!Number.isFinite(lastRun)||lastRun<started-5000||lastRun>now()+5000))throw Error('No fresh completed cycle was verified');
 const evidence={status:deferred?'deferred':'completed',authenticatedWake:true,event,runId,lastRun:result.lastRun||null,automaticOutreach:false};
 for(const field of ['created','prospectsDiscovered','websitesResearched','growthLensAudits'])if(Number.isSafeInteger(result[field])&&result[field]>=0)evidence[field]=result[field];
 return evidence;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const evidence=await wakeIntelligence({token:process.env.LEADFLOW_AUTOMATION_TOKEN,event:process.env.GITHUB_EVENT_NAME,runId:process.env.GITHUB_RUN_ID});
  await writeFile('schedule-wake-evidence.json',JSON.stringify({...evidence,commit:process.env.GITHUB_SHA},null,2)+'\n');
  console.log(JSON.stringify(evidence));
  if(evidence.status==='deferred')console.log('Another cycle is running; completion has not been independently verified.');
 }catch(error){console.error(error.message);process.exitCode=1}
}
