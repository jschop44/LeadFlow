import test from 'node:test';
import assert from 'node:assert/strict';
import {productTextMatches,supportedUSCatalogRecord,observedCommerceControl} from '../product-evidence.js';
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


test('enabled visible official product controls establish online checkout evidence',()=>{
 assert.equal(observedCommerceControl('<main><button type="submit">Add to Bag</button></main>'),'Add to Bag');
 assert.equal(observedCommerceControl('<button class="checkout"><span>Add to</span> <span>Basket</span></button>'),'Add to Basket');
 assert.equal(observedCommerceControl('<button aria-label="Buy Now"><svg aria-hidden="true"></svg></button>'),'Buy Now');
 assert.equal(observedCommerceControl('<input type="submit" value="Add to Cart">'),'Add to Cart');
 assert.equal(observedCommerceControl('<input type="button" value="Buy Now">'),'Buy Now');
});
test('commerce controls cannot be asserted from scripts, descriptions or disabled/hidden elements',()=>{
 for(const html of [
  '<script>const checkout="Add to Bag"</script><p>Coming soon</p>',
  '<p>Use the Add to Bag button when this product launches</p>',
  '<button disabled>Add to Bag</button>',
  '<button hidden>Buy Now</button>',
  '<button aria-hidden="true">Add to Cart</button>',
  '<button style="display:none">Buy Now</button>',
  '<input type="hidden" value="Add to Cart">',
  '<input type="submit" disabled value="Add to Bag">',
  '<template><button>Buy Now</button></template>',
  '<button>Our newsletter and shop tips are available now</button>'
 ])assert.equal(observedCommerceControl(html),undefined,'No published active checkout proof from '+html.slice(0,70));
});


test('hidden template and ancestor markup cannot verify unavailable products',()=>{
 for(const hidden of [
  '<template><h1>Infrared sauna blanket</h1></template>',
  '<div hidden><h1>Infrared sauna blanket</h1></div>',
  '<div inert><section><h1>Infrared sauna blanket</h1></section></div>',
  '<div aria-hidden="true"><p>Infrared sauna blanket</p></div>',
  '<aside style="display: none"><h2>Infrared sauna blanket</h2></aside>',
  '<aside style="visibility : hidden !important"><h2>Infrared sauna blanket</h2></aside>',
  '<svg><text>Infrared sauna blanket</text></svg>',
  '<script>const product = "Infrared sauna blanket";</script>',
  '<!-- Infrared sauna blanket -->'
 ])assert.equal(productTextMatches(hidden+'<main><h1>Other equipment</h1></main>','sauna blankets'),false,hidden);
 const visible='<div hidden><p>Red light therapy</p></div>'+
  '<main><h2>Infrared Sauna Blanket</h2></main>';
 assert.equal(productTextMatches(visible,'red light therapy'),false);
 assert.equal(productTextMatches(visible,'sauna blankets'),true);
});

test('a checkout nested in hidden source regions is not an observed active control',()=>{
 for(const hidden of [
  '<template><button>Add to Cart</button></template>',
  '<div hidden><button>Buy Now</button></div>',
  '<div aria-hidden="true"><button>Add to Bag</button></div>',
  '<section inert><input type="submit" value="Add to Cart"></section>',
  '<div style="display:none"><button>Buy Now</button></div>',
  '<div style="visibility: hidden"><button>Buy Now</button></div>'
 ])assert.equal(observedCommerceControl(hidden),undefined,hidden);
 assert.equal(observedCommerceControl(
  '<div hidden><button>Buy Now</button></div><main><button>Add to Bag</button></main>'
 ),'Add to Bag');
});
