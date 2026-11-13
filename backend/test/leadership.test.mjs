import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const begin=code.indexOf('function peopleFromStructuredData(');
const end=code.indexOf('async function research(website)',begin);
assert.ok(begin>=0&&end>begin,'Leadership parsers must exist');
const context=vm.createContext({URL});
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

test('ignores leadership claims without an explicit name and role',()=>{
 const html='<p>We are a founder-led company.</p><p>Our CEO is passionate about growth.</p><p>Contact our team for details.</p>';
 const people=context.peopleFromVisibleText(html,source);
 assert.equal(people.length,0);
});
test('does not invent leadership from invalid structured data',()=>{
 const html='<script type="application/ld+json">{invalid}</script><h2>Meet our founders</h2>';
 assert.equal(context.peopleFromStructuredData(html,source).length,0);
});
test('supports several executives while retaining the original source URL',()=>{
 const html='<script type="application/ld+json">'+JSON.stringify({'@type':'Organization',ceo:[{name:'Alice Brown'},{name:'David Wilson'}]})+'</script>';
 const people=context.peopleFromStructuredData(html,source);
 assert.equal(people.filter(x=>x.role==='CEO').length,2);
 assert.ok(people.every(x=>x.source===source));
});

test('company leadership extraction rejects an unrelated organization embedded in the website',()=>{
 const untrusted={'@type':'Organization',url:'https://different-firm.org/',founder:{'@type':'Person',name:'Jane Smith'}};
 const html='<script type="application/ld+json">'+JSON.stringify(untrusted)+'</script>';
 assert.equal(context.peopleFromStructuredData(html,'https://ridgeworks.com/about').length,0);
 const own={...untrusted,url:'https://ridgeworks.com/',founder:{'@type':'Person',name:'Robin Sanchez'}};
 const verified=context.peopleFromStructuredData('<script type="application/ld+json">'+JSON.stringify(own)+'</script>','https://ridgeworks.com/about');
 assert.equal(verified.length,1);
 assert.equal(verified[0].name,'Robin Sanchez');
});
