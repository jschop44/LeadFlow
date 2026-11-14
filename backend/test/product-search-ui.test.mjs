import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const start=html.indexOf('function onlineCoverageNote(');
const end=html.indexOf('\nlet socialBackgroundGeneration',start);
assert.ok(start>0&&end>start,'Progressive catalog coverage helper must be present');
const note=vm.runInNewContext(html.slice(start,end)+'\nonlineCoverageNote',{});

test('product search status accurately reports partial source inspection',()=>{
 const sample={searchCoverage:{eligibleCandidates:58,inspectedThisRequest:24,partial:true}};
 assert.match(note(sample),/24 of 58 eligible U\.S\. catalog candidates/);
 assert.match(note(sample),/Repeat the product search/);
 assert.equal(note({searchCoverage:{eligibleCandidates:4,inspectedThisRequest:4,partial:false}}),'');
 assert.equal(note([]),'');
});

test('invalid or contradictory coverage metadata cannot create misleading UI claims',()=>{
 for(const coverage of [
  {eligibleCandidates:-1,inspectedThisRequest:1,partial:true},
  {eligibleCandidates:3,inspectedThisRequest:24,partial:true},
  {eligibleCandidates:30,inspectedThisRequest:'unknown',partial:true},
  {eligibleCandidates:30,inspectedThisRequest:0,partial:false}
 ])assert.equal(note({searchCoverage:coverage}),'');
 assert.match(html,/textContent\+=onlineCoverageNote\(candidates\)/,'UI must actually display coverage after online search');
});
