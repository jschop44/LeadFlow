import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../backend/server.js',import.meta.url),'utf8');
const start=source.indexOf('async function inspectBusinessWebsite(raw){');
const end=source.indexOf('async function classifyElements(',start);
assert.ok(start>=0&&end>start);
const snippet=source.slice(start,end);
async function inspect(html,fail=false){
 const ctx=vm.createContext({URL,Date,platformCache:new Map(),get:async()=>{if(fail)throw Error('unavailable');return html}});
 return vm.runInContext(snippet+'\ninspectBusinessWebsite("https://example.com")',ctx);
}
test('professional service website is verified without commerce',async()=>{
 const result=await inspect('<html><title>Tax advisory firm</title></html>');
 assert.equal(result.websiteReachable,true);
 assert.equal(result.classification,'Web presence');
});
test('ecommerce remains Online',async()=>{
 assert.equal((await inspect('<button>Add to cart</button>')).classification,'Online');
});
test('unavailable website remains unverified',async()=>{
 const result=await inspect('',true);
 assert.notEqual(result.websiteReachable,true);
 assert.equal(result.classification,'Unverified');
});
test('nationwide catalog feeds automation and retains provenance',()=>{
 assert.match(source,/\['Online','Local \+ Online','Web presence'\]\.includes\(row\.classification\)/);
 assert.match(source,/source:'Wikidata nationwide verified catalog'/);
});
