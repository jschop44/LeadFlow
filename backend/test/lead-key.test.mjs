import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {leadKey} from '../lead-key.js';

// Ensure the single-file browser app uses the same identity rules as the Neon API.
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const begin=html.indexOf('function key(x){'),end=html.indexOf('\nconst LEAD_ARCHIVE_KEY',begin);
assert.ok(begin>=0&&end>begin,'Browser identity function must be present');
const browser=vm.createContext({URL,url:website=>/^https?:\/\//i.test(website||'')?website:''});
vm.runInContext(html.slice(begin,end),browser);
const both=x=>{
 const api=leadKey(x),ui=browser.key(x);
 assert.equal(ui,api,'Neon and browser identity must agree');
 return api;
};

test('separate OSM pizza franchise branches sharing one company website stay separate',()=>{
 const first={name:"Papa John's",website:'https://www.papajohns.com/',address:'123 Main St Bel Air MD',source:'OpenStreetMap Geofabrik Maryland extract node/123'};
 const second={...first,address:'481 Branch Road Abingdon MD',source:'OpenStreetMap Geofabrik Maryland extract node/456'};
 assert.equal(both(first),'osm:node/123');
 assert.equal(both(second),'osm:node/456');
 assert.notEqual(both(first),both(second),'Distinct physical branches are not one company record');
});
test('same physical OSM element remains deduplicated after source names and website change',()=>{
 const first={name:'Local Pizza',website:'https://pizza.example/',address:'100 Main Street',source:'OpenStreetMap node/321'};
 const repeated={...first,website:'https://www.pizza.example/order',source:'OpenStreetMap + Wikidata node/321'};
 assert.equal(both(first),both(repeated));
 assert.equal(both(first),'osm:node/321');
});
test('online-only merchants retain domain-based identity and no invented local branch',()=>{
 const first={name:'Online Shop',website:'https://www.shop.example/products',address:'United States',source:'Wikidata nationwide verified catalog'};
 const second={...first,website:'https://shop.example/'};
 assert.equal(both(first),'domain:shop.example');
 assert.equal(both(first),both(second));
});
test('unsourced or forged element references cannot force local identity',()=>{
 const unrelated={name:'Other',website:'https://other.example',address:'Somewhere',source:'Unverified comment node/123'};
 assert.equal(both(unrelated),'domain:other.example');
 const siteFree={name:'Corner Cafe',website:'',address:'River Road',source:'No validated element'};
 assert.equal(both(siteFree),'listing:corner cafe|river road');
});
test('frontend cross-device history sends source evidence for accurate server keys',()=>{
 assert.match(html,/name:item\.name,website:item\.website,address:item\.address,source:item\.source\|\|''/,
  'check-seen must transmit original OSM element provenance to the Neon library');
});
