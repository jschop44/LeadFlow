import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../../.github/workflows/deploy-pages.yml',import.meta.url),'utf8');
const browser=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const oauth=readFileSync(new URL('../email-oauth.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');

test('free Pages workflow stages only the public website and runs on main UI changes',()=>{
 assert.match(workflow,/push:\s*\n\s*branches:\s*\[main\]/);
 assert.match(workflow,/path:\s*_site/);
 assert.match(workflow,/install -m 644 index\.html _site\/index\.html/);
 assert.doesNotMatch(workflow,/path:\s*\.\s*(?:\n|$)/);
 assert.match(workflow,/test "\$\(find _site -type f \| wc -l\)" -eq 1/);
 assert.match(workflow,/pages:\s*write/);
 assert.match(workflow,/id-token:\s*write/);
});
test('public frontend uses only the exact Pages OAuth return destination, not an open redirect',()=>{
 assert.match(browser,/location\.origin==='https:\/\/jschop44\.github\.io'/);
 assert.match(browser,/https:\/\/jschop44\.github\.io\/LeadFlow\//);
 assert.match(oauth,/const PAGES_FRONTEND='https:\/\/jschop44\.github\.io\/LeadFlow\/'/);
 assert.match(oauth,/\[FRONTEND,API\+'\/app',PAGES_FRONTEND\]\.includes\(returnTo\)/);
 assert.match(server,/const PAGES_ORIGIN='https:\/\/jschop44\.github\.io'/);
 assert.doesNotMatch(server,/\.endsWith\(['"]\.github\.io/);
});
