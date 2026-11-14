import test from 'node:test';
import assert from 'node:assert/strict';
import {productInspectionWindow} from '../product-candidate-window.js';

const records=n=>Array.from({length:n},(_,i)=>({domain:'merchant-'+i+'.example',niches:i%2?'Sauna blankets':[]}));

test('generic product searches eventually inspect all US businesses without exceeding 24 per request',()=>{
 const all=records(65);
 const cursors=new Map();
 const seen=new Set();
 for(let i=0;i<3;i++){
  const page=productInspectionWindow(all,undefined,'sauna blanket',cursors);
  assert.ok(page.length<=24);
  assert.equal(new Set(page.map(x=>x.domain)).size,page.length);
  for(const item of page)seen.add(item.domain);
 }
 assert.equal(seen.size,65,'catalog entries after the first 24 must become inspectable');
});

test('category hints are prioritized but never starve other catalog merchants',()=>{
 const group=records(40).map((x,i)=>({...x,niches:i<30?['Sauna blankets']:[]}));
 const cursors=new Map();
 const seen=new Set();
 for(let i=0;i<3;i++){
  const page=productInspectionWindow(group,'Sauna blankets','sauna blankets',cursors);
  assert.equal(page.length,24);
  assert.equal(new Set(page.map(x=>x.domain)).size,24);
  assert.ok(page.filter(x=>x.niches.includes('Sauna blankets')).length>=12);
  assert.ok(page.some(x=>!x.niches.includes('Sauna blankets')));
  for(const item of page)seen.add(item.domain);
 }
 assert.equal(seen.size,40);
});

test('small verified catalog is inspected completely and cursor keys stay bounded',()=>{
 const all=records(3);
 const cursors=new Map();
 for(let i=0;i<220;i++){
  const page=productInspectionWindow(all,undefined,'product '+i,cursors);
  assert.equal(page.length,3);
  assert.ok(cursors.size<=200);
 }
 assert.deepEqual(productInspectionWindow([],undefined,'empty',cursors),[]);
});
