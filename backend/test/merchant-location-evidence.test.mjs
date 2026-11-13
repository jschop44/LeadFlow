import test from 'node:test';
import assert from 'node:assert/strict';
import {firstPartyMerchantLocation,merchantProductPage,sameMerchantHost} from '../merchant-location-evidence.js';
import {supportedUSCatalogRecord,productTextMatches} from '../product-evidence.js';

const hooga={name:'Hooga',website:'https://hoogahealth.com/',
 officePage:'https://hoogahealth.com/pages/about',officePhrase:'New Berlin WI USA',
 officeLocation:'New Berlin, WI, USA',productPage:'https://hoogahealth.com/collections/red-light-therapy-devices'};
test('first-party published US office must be visible and same-domain, not just US shipping',()=>{
 const html='<html><head><script>New Berlin WI USA</script></head><body><p>Free US shipping</p></body></html>';
 assert.equal(firstPartyMerchantLocation(hooga,html),null);
 const valid=firstPartyMerchantLocation(hooga,'<main><p>Hooga is based in New Berlin, WI, USA.</p></main>');
 assert.equal(valid.usEvidenceSource,hooga.officePage);
 assert.equal(valid.usEvidenceKind,'first_party_location_statement');
 assert.match(valid.usEvidence,/New Berlin/);
 assert.equal(supportedUSCatalogRecord({element:{tags:{website:hooga.website}},...valid}),true);
 assert.equal(supportedUSCatalogRecord({...valid,element:{tags:{website:'https://other.example/'}}}),false);
 assert.equal(supportedUSCatalogRecord({...valid,usEvidenceSource:'https://other.example/us-office',
  element:{tags:{website:hooga.website}}}),false);
});
test('official US-office statements can be checked without treating shipping policies as location evidence',()=>{
 const higher={website:'https://higherdose.com/',officePage:'https://higherdose.com/pages/terms-conditions',
 officePhrase:'operated by HigherDOSE from its offices in New York',officeLocation:'New York, NY, USA'};
 const text='<p>This Site is controlled and operated by HigherDOSE from its offices in New York.</p>';
 const proof=firstPartyMerchantLocation(higher,text);
 assert.ok(proof&&supportedUSCatalogRecord({...proof,element:{tags:{website:higher.website}}}));
 assert.equal(firstPartyMerchantLocation(higher,'<p>Shipping available in the United States</p>'),null);
 assert.equal(firstPartyMerchantLocation({...higher,officePage:'https://someone-else.example/contact'},text),null);
});
test('product evidence can use collection pages only on the same HTTPS official host',()=>{
 const source={element:{tags:{website:hooga.website}},productEvidencePage:hooga.productPage};
 assert.equal(merchantProductPage(source),hooga.productPage);
 assert.equal(productTextMatches('<article><h2>Red Light Therapy Panels</h2></article>','red light therapy'),true);
 assert.equal(productTextMatches('<article>Infrared Sauna Blanket</article>','sauna blankets'),true);
 assert.equal(merchantProductPage({...source,productEvidencePage:'https://external.example/items'}),hooga.website);
 assert.equal(merchantProductPage({...source,productEvidencePage:'http://hoogahealth.com/items'}),hooga.website);
 assert.equal(sameMerchantHost(hooga.website,'https://www.hoogahealth.com/collections/red-light-therapy-devices'),true);
 assert.equal(sameMerchantHost('https://hoogahealth.com/','https://hoogahealth.com.evil.example/items'),false);
});
test('do not turn unsupported US shipping or labels into business-location verification',()=>{
 assert.equal(supportedUSCatalogRecord({usEvidence:'U.S. shipping offered on public storefront; headquarters not independently verified',
  element:{tags:{website:hooga.website}}}),false);
 assert.equal(supportedUSCatalogRecord({usEvidence:'First-party published US office: New Berlin, WI, USA',
  usEvidenceKind:'first_party_location_statement',element:{tags:{website:hooga.website}}}),false);
 assert.equal(supportedUSCatalogRecord({usEvidence:'US mapped business record'}),true);
});
