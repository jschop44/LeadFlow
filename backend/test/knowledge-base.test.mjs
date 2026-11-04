import test from 'node:test';
import assert from 'node:assert/strict';
import {knowledgeAction} from '../knowledge-base.js';
test('knowledge module is disabled by default and does not access database',async()=>{
 const previous=process.env.KNOWLEDGE_BASE_ENABLED;
 delete process.env.KNOWLEDGE_BASE_ENABLED;
 try{await assert.rejects(knowledgeAction('ingest',{title:'example',content:'test content'}),/disabled by feature flag/)}
 finally{if(previous===undefined)delete process.env.KNOWLEDGE_BASE_ENABLED;else process.env.KNOWLEDGE_BASE_ENABLED=previous}
});
test('knowledge module refuses missing persistent storage when enabled',async()=>{
 const previous=process.env.KNOWLEDGE_BASE_ENABLED,db=process.env.DATABASE_URL;
 process.env.KNOWLEDGE_BASE_ENABLED='true';delete process.env.DATABASE_URL;
 try{await assert.rejects(knowledgeAction('search',{query:'test',collection:'business'}),/Persistent database not configured/)}
 finally{if(previous===undefined)delete process.env.KNOWLEDGE_BASE_ENABLED;else process.env.KNOWLEDGE_BASE_ENABLED=previous;if(db!==undefined)process.env.DATABASE_URL=db}
});
