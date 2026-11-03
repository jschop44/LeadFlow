import test from 'node:test';
import assert from 'node:assert/strict';
import {auditOpportunity,personalizedDraft} from '../growthlens-outreach.js';
test('uses only failed audit findings with explicit source',()=>{
 const o=auditOpportunity({url:'https://example.com',score:62,findings:[{id:'contact',name:'Contact links',passed:false},{id:'navigation',name:'Navigation',passed:true}]},'Website improvement');
 assert.equal(o.verified,true);assert.equal(o.id,'contact');assert.equal(o.source,'https://example.com');
 const d=personalizedDraft({business:'Example Co',service:'Website improvement',sender:'Agency, 1 Main St',unsubscribe:'Reply unsubscribe'},o);
 assert.match(d.text,/Contact links/i);assert.equal(d.sendingEnabled,false);
});
test('does not invent issues when no verified findings exist',()=>{
 const o=auditOpportunity({findings:[{id:'contact',passed:true}]},'Web design');
 assert.equal(o.verified,false);
 const d=personalizedDraft({business:'Example Co',service:'Web design',sender:'Agency',unsubscribe:'Reply unsubscribe'},o);
 assert.match(d.text,/have not verified a specific issue/);
});
