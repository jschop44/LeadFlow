import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
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
  await store.save({...row,name:'Refreshed business name'});
  assert.equal(store.records.get('example.org').sharedFeedback.positive,2,'Refreshing metadata must preserve feedback');
  const reopened=createCatalogStore(dir);
  await reopened.init();
  assert.deepEqual(reopened.records.get('example.org').sharedFeedback,{positive:2,negative:1,evidenceType:'unverified_feedback'});
  const snapshot=JSON.parse(await readFile(join(dir,'online-catalog.json'),'utf8'));
  assert.equal(snapshot.find(x=>x.domain==='example.org').sharedFeedback.positive,2);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('failed snapshot writes do not acknowledge or publish catalog updates',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'leadflow-catalog-failure-'));
 try{
  const blocker=join(dir,'not-a-directory');
  await writeFile(blocker,'block directory creation');
  const store=createCatalogStore(blocker);
  await assert.rejects(store.save({domain:'failure.example',name:'Must not publish'}));
  assert.equal(store.records.has('failure.example'),false);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('catalog snapshot is restored after multiple sequential saves',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'leadflow-catalog-sequence-'));
 try{
  const store=createCatalogStore(dir);
  await store.init();
  await Promise.all([
   store.save({domain:'first.example',name:'First'}),
   store.save({domain:'second.example',name:'Second'}),
   store.save({domain:'third.example',name:'Third'})
  ]);
  const reopened=createCatalogStore(dir);
  await reopened.init();
  assert.deepEqual([...reopened.records.keys()].sort(),['first.example','second.example','third.example']);
 }finally{await rm(dir,{recursive:true,force:true})}
});
