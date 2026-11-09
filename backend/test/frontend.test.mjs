import test from 'node:test';
import assert from 'node:assert/strict';
import {serveFrontend} from '../frontend.js';
function response(){return {writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};}
test('serves the current frontend through an explicit route without exposing backend files',async()=>{
 const res=response();assert.equal(await serveFrontend({url:'/app',method:'GET'},res),true);
 assert.equal(res.status,200);assert.match(res.body.toString(),/serverDraft.socialText/);assert.match(res.body.toString(),/business:lead.name,niche:lead.niche/);
 assert.equal(res.headers['content-security-policy'],"frame-ancestors 'none'");
 const head=response();await serveFrontend({url:'/app/',method:'HEAD'},head);assert.equal(head.body,undefined);assert.equal(head.status,200);
 assert.equal(await serveFrontend({url:'/backend/server.js',method:'GET'},response()),false);
 assert.equal(await serveFrontend({url:'/app/../../backend/server.js',method:'GET'},response()),false);
 const post=response();await serveFrontend({url:'/app',method:'POST'},post);assert.equal(post.status,405);
});
