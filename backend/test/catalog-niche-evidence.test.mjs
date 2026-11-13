import test from 'node:test';
import assert from 'node:assert/strict';
import {supportsCatalogNiche} from '../catalog-niche-evidence.js';
const record=(name,description='')=>({niches:['Financial advisors'],element:{tags:{name,description}}});
test('catalog labels and search terms alone cannot qualify an advisor',()=>{
 for(const row of [record('IQL Behavioral Health Services'),record('Grants Management Systems','accounting software company'),record('Palumbo Insurance Associates'),record('Bradley Atlantic Insurance Management')])assert.equal(supportsCatalogNiche(row,'Financial advisors'),false);
 assert.equal(supportsCatalogNiche(record('New Century Advisors','US investment management company'),'Financial advisors'),false);
 assert.equal(supportsCatalogNiche(record('New Century Advisors','US investment advisor and wealth management firm'),'Financial advisors'),true);
 assert.equal(supportsCatalogNiche(record('Independent Financial Advisors'),'Financial advisors'),true);
 assert.equal(supportsCatalogNiche({niches:['Insurance agencies'],element:{tags:{name:'Independent Financial Advisors'}}},'Financial advisors'),false);
});
