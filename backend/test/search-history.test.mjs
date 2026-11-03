import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSearchHistory} from '../search-history.js';

test('shared history persists, normalizes and deduplicates business domains',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'leadflow-search-history-'));
 const previous=process.env.DATABASE_URL;
 process.env.DATABASE_URL='';
 try{
  const first=createSearchHistory(dir);await first.init();
  assert.equal(await first.record([
   {tags:{website:'https://www.restorreco.com',name:'Restorreco'}},
   {website:'https://restorreco.com/about',name:'Restorreco'},
   {website:'http://localhost:3000',name:'Invalid local'}]),2);
  const second=createSearchHistory(dir);await second.init();
  const rows=await second.recent();
  assert.equal(rows.filter(r=>r.domain==='restorreco.com').length,1);
  assert.equal(rows[0].domain,'localhost');
 }finally{
  if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous;
  await rm(dir,{recursive:true,force:true});
 }
});
