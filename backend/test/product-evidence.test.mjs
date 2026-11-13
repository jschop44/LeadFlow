import test from 'node:test';
import assert from 'node:assert/strict';
import {productTextMatches,supportedUSCatalogRecord} from '../product-evidence.js';
test('product evidence excludes hidden scripts and unrelated health or dental wording',()=>{
 assert.equal(productTextMatches('<script>red light therapy</script><h1>Family dental care</h1>','red light therapy'),false);
 assert.equal(productTextMatches('<h1>Red light therapy</h1>','red light therapy'),true);
 assert.equal(productTextMatches('<h1>Infrared sauna blanket</h1>','sauna blankets'),true);
 assert.equal(productTextMatches('<h1>Sauna blankets</h1>','sauna blankets'),true);
 assert.equal(productTextMatches('<h1>Sauna blankets</h1>','sauna blanket'),true);
 assert.equal(productTextMatches('<h1>Bed blankets</h1>','sauna blankets'),false);
 assert.equal(productTextMatches('<h1>Blankets</h1>','sauna blankets'),false);
 assert.equal(productTextMatches('<h1>Red hair and light dental therapy</h1>','red light therapy'),false);
 assert.equal(productTextMatches('<h1>Therapy red light kit</h1>','red light therapy'),false);
 assert.equal(supportedUSCatalogRecord({usEvidence:'U.S. shipping offered on public storefront; headquarters not independently verified'}),false);
 assert.equal(supportedUSCatalogRecord({usEvidence:'US mapped business record'}),true);
 assert.equal(supportedUSCatalogRecord({usEvidence:'Wikidata US country statement and successful public website inspection'}),true);
});
