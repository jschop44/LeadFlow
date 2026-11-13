import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('HTTP feedback survives a server restart and changes priority, not evidence', {timeout:30000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'leadflow-feedback-e2e-'));
 const token='isolated-feedback-test-token';
 const domain='isolated-test.example';
 const row={domain,classification:'Online',checkedAt:Date.now(),platform:'Not verified',
   element:{tags:{name:'Isolated Test Company',website:'https://isolated-test.example'}},
   evidence:'Not inspected',usEvidence:'Unknown',niches:['marketing']};
 await mkdir(dir,{recursive:true});
 await writeFile(join(dir,'online-catalog.json'),JSON.stringify([row]));
 let child;
 const port=24000+Math.floor(Math.random()*1000);
 const base='http://127.0.0.1:'+port;
 async function start(){
  child=spawn(process.execPath,['backend/server.js'],{env:{...process.env,DATABASE_URL:'',LEADFLOW_DATA_DIR:dir,PORT:String(port),
    API_TOKEN:'isolated-read-token',SHARED_INTELLIGENCE_TOKEN:token},stdio:'ignore'});
  for(let i=0;i<80;i++){
   if(child.exitCode!==null)throw Error('server exited');
   try{const response=await fetch(base+'/health');if(response.ok&&(await response.json()).onlineCatalog?.ready)return}catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('server startup timed out');
 }
 async function stop(){
  if(!child)return;
  const current=child;
  if(current.exitCode===null){
   current.kill('SIGTERM');
   await new Promise(resolve=>{current.once('exit',resolve);setTimeout(resolve,1500).unref()});
  }
  child=null;
 }
 async function request(body){
  const response=await fetch(base+'/intelligence',{method:'POST',headers:{'content-type':'application/json','x-leadflow-token':token},body:JSON.stringify(body)});
  assert.equal(response.status,200);
  return response.json();
 }
 try{
  await start();
  const before=(await request({query:'Isolated Test Company',limit:5})).leads.find(x=>x.domain===domain);
  assert.ok(before,'seeded lead must appear');
  assert.equal(before.feedbackAdjustment,0);
  const empty=await request({action:'feedback-sync',domain,positive:0,negative:0});
  assert.equal(empty.accepted,false);
  assert.equal(empty.reason,'invalid_counts');
  const ack=await request({action:'feedback-sync',domain,positive:5,negative:0});
  assert.equal(ack.accepted,true);
  assert.equal(ack.storage,'ephemeral_snapshot');
  const after=(await request({query:'Isolated Test Company',limit:5})).leads.find(x=>x.domain===domain);
  assert.equal(after.score,before.score,'feedback must not modify evidence score');
  assert.ok(after.priorityScore>before.priorityScore,'positive feedback should increase priority');
  assert.equal(after.feedbackEvidenceType,'user_reported_unverified');
  await stop();
  await start();
  const restored=(await request({query:'Isolated Test Company',limit:5})).leads.find(x=>x.domain===domain);
  assert.equal(restored.priorityScore,after.priorityScore);
  assert.equal(restored.sharedFeedback.positive,5);
 }finally{await stop();await rm(dir,{recursive:true,force:true})}
});
