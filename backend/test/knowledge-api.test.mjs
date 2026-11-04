import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const base='http://127.0.0.1:18799';
test('knowledge API enforces token and opt-in, without touching storage',async()=>{
 const child=spawn(process.execPath,['backend/server.js'],{env:{...process.env,PORT:'18799',API_TOKEN:'kb-ci-token',KNOWLEDGE_BASE_ENABLED:'false',DATABASE_URL:''},stdio:'ignore'});
 try{
  let ready=false;
  for(let i=0;i<40;i++){
   try{const response=await fetch(base+'/health');if(response.ok){ready=true;break}}catch{}
   await new Promise(r=>setTimeout(r,150));
  }
  assert.ok(ready,'server started');
  const payload=JSON.stringify({action:'status'});
  const unauthorized=await fetch(base+'/knowledge',{method:'POST',headers:{'content-type':'application/json'},body:payload});
  assert.equal(unauthorized.status,401);
  const disabled=await fetch(base+'/knowledge',{method:'POST',headers:{'content-type':'application/json','x-leadflow-token':'kb-ci-token'},body:payload});
  assert.ok(!disabled.ok,'disabled knowledge request must fail');
  assert.match(JSON.stringify(await disabled.json()),/disabled by feature flag/);
 }finally{child.kill('SIGTERM')}
});
