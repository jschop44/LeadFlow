import test from 'node:test';
import assert from 'node:assert/strict';
import {createHealthProbe} from '../health-probe.js';

test('slow optional storage cannot block health, and overlapping checks are shared',async()=>{
 let finish,calls=0,time=0;
 const probe=createHealthProbe(()=>{calls++;return new Promise(r=>{finish=r})},{now:()=>time,ttl:100});
 assert.deepEqual(probe.read(),{storageReady:false,checking:true,checkedAt:null});
 for(let i=0;i<20;i++)assert.equal(probe.read().checking,true);
 await new Promise(setImmediate);assert.equal(calls,1);
 finish();await new Promise(setImmediate);
 const snapshot=probe.read();assert.equal(snapshot.storageReady,true);assert.equal(snapshot.checkedAt,0);
 snapshot.storageReady=false;assert.equal(probe.read().storageReady,true);
 time=99;assert.equal(probe.read().checking,false);
 time=100;assert.equal(probe.read().checking,true);
 await new Promise(setImmediate);assert.equal(calls,2);finish();await new Promise(setImmediate);
});
test('failure is reported without leaking credentials, followed by a successful retry',async()=>{
 let time=1,fail=true;
 const probe=createHealthProbe(async()=>{if(fail)throw Error('secret database URL')},{now:()=>time,ttl:100});
 probe.read();await new Promise(setImmediate);
 assert.deepEqual(probe.read(),{storageReady:false,checking:false,checkedAt:1});
 fail=false;time=101;probe.read();await new Promise(setImmediate);
 assert.equal(probe.read().storageReady,true);
});
