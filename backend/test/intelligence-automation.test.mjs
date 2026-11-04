import test from 'node:test';
import assert from 'node:assert/strict';
import {runIntelligenceCycle,intelligenceAction} from '../intelligence-automation.js';
test('automation requires explicit opt-in',async()=>{
 const old=process.env.INTELLIGENCE_AUTOMATION_ENABLED;
 try{
  delete process.env.INTELLIGENCE_AUTOMATION_ENABLED;
  assert.equal((await runIntelligenceCycle()).enabled,false);
  assert.equal((await intelligenceAction('status')).enabled,false);
 }finally{
  if(old===undefined)delete process.env.INTELLIGENCE_AUTOMATION_ENABLED;
  else process.env.INTELLIGENCE_AUTOMATION_ENABLED=old;
 }
});
