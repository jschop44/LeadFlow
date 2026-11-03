import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCatalogStore} from '../catalog-store.js';

test('catalog feedback persists across store restart and subsequent refresh', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'leadflow-catalog-test-'));
 try{
  const store=createCatalogStore(dir);
  await store.init();
  const row={domain:'example.org',classification:'Online',name:'Example'};
  await store.save(row);
  await store.save({...row,sharedFeedback:{positive:2,negative:1,evidenceType:'unverified_feedback'}});
  const reopened=createCatalogStore(dir);
  await reopened.init();
  assert.deepEqual(reopened.records.get('example.org').sharedFeedback,{positive:2,negative:1,evidenceType:'unverified_feedback'});
  const snapshot=JSON.parse(await readFile(join(dir,'online-catalog.json'),'utf8'));
  assert.equal(snapshot.find(x=>x.domain==='example.org').sharedFeedback.positive,2);
 }finally{await rm(dir,{recursive:true,force:true})}
});
