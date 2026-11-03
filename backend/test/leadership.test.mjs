import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const begin=code.indexOf('function peopleFromStructuredData(');
const end=code.indexOf('async function research(website)',begin);
assert.ok(begin>=0&&end>begin,'Leadership parsers must exist');
const context=vm.createContext({});
vm.runInContext(code.slice(begin,end),context);
const source='https://example.org/about';
test('extracts founder and CEO from organization JSON-LD with source',()=>{
 const html='<script type="application/ld+json">'+JSON.stringify({'@type':'Organization',founder:[{'@type':'Person',name:'Jane Smith'},{'@type':'Person',name:'John Doe'}],ceo:{'@type':'Person',name:'Alex Morgan'}})+'</script>';
 const people=context.peopleFromStructuredData(html,source);
 assert.equal(people.filter(x=>x.role==='Founder').length,2);
 assert.ok(people.some(x=>x.name==='Alex Morgan'&&x.role==='CEO'&&x.source===source));
});
test('extracts explicit visible leadership labels without inventing people',()=>{
 const html='<h2>Founder: Jane Smith</h2><p>Alex Morgan — CEO</p><p>Our team delivers excellent service.</p>';
 const people=context.peopleFromVisibleText(html,source);
 assert.ok(people.some(x=>x.name==='Jane Smith'&&x.role==='Founder'));
 assert.ok(people.some(x=>x.name==='Alex Morgan'&&x.role==='CEO'));
 assert.equal(people.length,2);
});
test('live enrichment route uses both parsers and leadership pages',()=>{
 const route=code.slice(end,code.indexOf('const escape=',end));
 assert.match(route,/peopleFromStructuredData\(html,root\+path\)/);
 assert.match(route,/peopleFromVisibleText\(html,root\+path\)/);
 assert.match(route,/\/leadership/);
});
