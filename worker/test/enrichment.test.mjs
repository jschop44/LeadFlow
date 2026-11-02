import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const originalFetch=globalThis.fetch;
async function run(website,handler){globalThis.fetch=handler;try{return await worker.fetch(new Request('https://worker.test/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({website})}))}finally{globalThis.fetch=originalFetch}}
test('rejects localhost and numeric IP destinations',async()=>{for(const website of ['http://localhost','http://127.0.0.1','http://169.254.169.254','file:///etc/passwd']){const r=await run(website,()=>{throw Error('Unexpected fetch')});assert.equal(r.status,400)}});
test('does not crawl when robots cannot be verified',async()=>{let calls=0;const r=await run('https://advisor.example',async()=>{calls++;return new Response('',{status:503})});assert.equal(r.status,403);assert.equal(calls,1)});
test('honors disallow rules',async()=>{let calls=[];const r=await run('https://advisor.example',async url=>{calls.push(String(url));if(String(url).endsWith('/robots.txt'))return new Response('User-agent: *\nDisallow: /contact\nDisallow: /team',{status:200});return new Response('<a href="mailto:hello@advisor.example">Email</a>',{headers:{'content-type':'text/html'}})});assert.equal(r.status,200);assert.ok(!calls.some(x=>x.endsWith('/contact')||x.endsWith('/team')));const data=await r.json();assert.ok(data.emails.includes('hello@advisor.example'))});
test('does not follow redirect from crawled pages',async()=>{const r=await run('https://advisor.example',async url=>String(url).endsWith('/robots.txt')?new Response('',{status:404}):new Response('',{status:302,headers:{location:'http://localhost'}}));assert.equal(r.status,200);assert.equal((await r.json()).emails.length,0)});
test('extracts publicly linked social profiles',async()=>{const r=await run('https://advisor.example',async url=>String(url).endsWith('/robots.txt')?new Response('',{status:404}):new Response('<a href="https://www.linkedin.com/company/advisor-example">LinkedIn</a>',{headers:{'content-type':'text/html'}}));assert.equal(r.status,200);assert.ok((await r.json()).socials.some(x=>x.includes('linkedin.com')))});
