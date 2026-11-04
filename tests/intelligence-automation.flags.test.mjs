import assert from 'node:assert/strict';
import {test} from 'node:test';
import {intelligenceAction,runIntelligenceCycle,startIntelligenceScheduler} from '../backend/intelligence-automation.js';

test('automation defaults to disabled without both explicit flags', async () => {
  const previous = {
    KNOWLEDGE_BASE_ENABLED: process.env.KNOWLEDGE_BASE_ENABLED,
    INTELLIGENCE_AUTOMATION_ENABLED: process.env.INTELLIGENCE_AUTOMATION_ENABLED
  };
  try {
    for (const [knowledge, automation] of [['false','false'],['true','false'],['false','true']]) {
      process.env.KNOWLEDGE_BASE_ENABLED=knowledge;
      process.env.INTELLIGENCE_AUTOMATION_ENABLED=automation;
      const cycle=await runIntelligenceCycle();
      assert.equal(cycle.enabled,false);
      assert.match(cycle.reason,/feature flag/i);
      const status=await intelligenceAction('status');
      assert.equal(status.enabled,false);
      assert.doesNotThrow(()=>startIntelligenceScheduler());
    }
  } finally {
    for(const [key,value] of Object.entries(previous)){
      if(value===undefined)delete process.env[key];
      else process.env[key]=value;
    }
  }
});
