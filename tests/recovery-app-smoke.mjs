// Run against an isolated restored Neon branch only:
// DATABASE_URL=<restored-branch-uri> node tests/recovery-app-smoke.mjs
// Never point this test at the live production branch.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import net from 'node:net';
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL must target the restored staging branch');
assert.equal(process.env.RECOVERY_DRILL_CONFIRMED, 'yes', 'Set RECOVERY_DRILL_CONFIRMED=yes after checking the restored branch URL');
const recoveryHost=new URL(process.env.DATABASE_URL).hostname;
assert.equal(recoveryHost,'ep-summer-sun-b8z5lyht-pooler.c-14.us-east-1.aws.neon.tech','Refusing to run: connection does not target the isolated restored Neon branch');
const server=net.createServer();await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).on('error',reject));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
const child=spawn(process.execPath,['backend/server.js'],{env:{...process.env,PORT:String(port),INTELLIGENCE_ENGINE_ENABLED:'false',KNOWLEDGE_BASE_ENABLED:'false',LEADFLOW_LIVE_DIAGNOSTICS:'0'},stdio:['ignore','pipe','pipe']});
let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output+=String(chunk).slice(0,1000)});
try{
 let response;for(let attempt=0;attempt<50;attempt++){if(child.exitCode!==null)throw Error('Backend exited before ready');try{response=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(1500)});if(response.ok)break}catch{}await delay(300)}
 assert.ok(response?.ok,'Restored-branch app health check failed: '+output.slice(-1500));
 const health=await response.json();assert.ok(health,'Missing app health response');
 let verified=false;for(let attempt=0;attempt<60;attempt++){if(/Neon lead library verification/.test(output) && output.includes('"passed":true')){verified=true;break}if(/Lead library unavailable:/.test(output))break;await delay(250)}assert.ok(verified,'Restored-branch lead library verification did not pass: '+output.slice(-1500));
 console.log(JSON.stringify({passed:true,checks:['full backend process boot','health HTTP 200','restored branch configured','lead library transactional verification'],healthStatus:response.status}));
}finally{child.kill('SIGTERM')}
