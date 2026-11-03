import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedWebsite,verifiedWikidataPeople} from '../wikidata-leadership.js';
const make=(site,name='Jane Smith',role='Founder')=>({officialWebsite:{value:site},item:{value:'https://www.wikidata.org/entity/Q123'},person:{value:'https://www.wikidata.org/entity/Q456'},personLabel:{value:name},role:{value:role}});
test('matches official domain despite www and trailing slash differences',()=>{
 assert.equal(normalizedWebsite('https://www.example.com/'),normalizedWebsite('https://example.com'));
 assert.equal(verifiedWikidataPeople([make('http://www.example.com/')],'https://example.com').length,1);
});
test('rejects similarly named and maliciously suffixed domains',()=>{
 assert.equal(verifiedWikidataPeople([make('https://example.com.evil.org')],'https://example.com').length,0);
 assert.equal(verifiedWikidataPeople([make('https://other-company.com')],'https://example.com').length,0);
});
test('retains attribution for independently matched founder and CEO',()=>{
 const people=verifiedWikidataPeople([make('https://example.com','Jane Smith','Founder'),make('https://example.com','Alex Morgan','CEO')],'https://example.com');
 assert.equal(people.length,2);
 assert.ok(people.every(x=>x.independentSource==='Wikidata'&&x.source==='https://www.wikidata.org/entity/Q123'));
});
test('rejects ungrounded people and arbitrary external entity URLs',()=>{
 const bad=make('https://example.com','Jane Smith','CEO');bad.person.value='https://evil.example/Q456';
 assert.equal(verifiedWikidataPeople([bad],'https://example.com').length,0);
});

test('accepts Wikidata SPARQL HTTP entity identifiers',()=>{
 const row=make('https://example.com');
 row.item.value='http://www.wikidata.org/entity/Q123';
 row.person.value='http://www.wikidata.org/entity/Q456';
 assert.equal(verifiedWikidataPeople([row],'https://example.com').length,1);
});
