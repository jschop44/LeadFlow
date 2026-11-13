import test from 'node:test';
import assert from 'node:assert/strict';
import {firstPartyMerchantLocation,merchantProductPage,sameMerchantHost,merchantSourceMaxBytes} from '../merchant-location-evidence.js';
import {supportedUSCatalogRecord,productTextMatches} from '../product-evidence.js';

const hooga={name:'Hooga',website:'https://hoogahealth.com/',
 officePage:'https://hoogahealth.com/pages/about',officePhrase:'New Berlin WI USA',
 officeLocation:'New Berlin, WI, USA',productPage:'https://hoogahealth.com/products/hooga-300w-red-and-near-infrared-light-therapy-panel'};
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
test('category-specific product evidence stays first party even when same merchant sells different goods',()=>{
 const website='https://hoogahealth.com/';
 const red='https://hoogahealth.com/products/hooga-300w-red-and-near-infrared-light-therapy-panel';
 const sauna='https://hoogahealth.com/products/infrared-sauna-blanket';
 const row={element:{tags:{website}},productEvidencePage:red,productEvidencePages:{
  'Red light therapy devices':red,'Sauna blankets':sauna
 }};
 assert.equal(merchantProductPage(row,'Red light therapy devices'),red);
 assert.equal(merchantProductPage(row,'Sauna blankets'),sauna);
 assert.equal(merchantProductPage(row,'Skin-care devices'),website,'missing category must not inherit another category proof');
 assert.equal(merchantProductPage(row),red,'old single-niche records remain readable');
 assert.equal(merchantProductPage({...row,productEvidencePages:{'Sauna blankets':'https://evil.example/shop'}},'Sauna blankets'),website);
 assert.equal(merchantProductPage({...row,productEvidencePages:{'Sauna blankets':'http://hoogahealth.com/shop'}},'Sauna blankets'),website);
 assert.equal(merchantSourceMaxBytes([{...hooga,productPage:sauna}],sauna),2_000_000);
 assert.equal(merchantSourceMaxBytes([hooga],sauna),350_000);
});

test('do not turn unsupported US shipping or labels into business-location verification',()=>{
 assert.equal(supportedUSCatalogRecord({usEvidence:'U.S. shipping offered on public storefront; headquarters not independently verified',
  element:{tags:{website:hooga.website}}}),false);
 assert.equal(supportedUSCatalogRecord({usEvidence:'First-party published US office: New Berlin, WI, USA',
  usEvidenceKind:'first_party_location_statement',element:{tags:{website:hooga.website}}}),false);
 assert.equal(supportedUSCatalogRecord({usEvidence:'US mapped business record'}),true);
});

test('large merchant HTML budget only applies to exact enumerated first-party source pages',()=>{
 const curated=[hooga];
 assert.equal(merchantSourceMaxBytes(curated,hooga.officePage),2_000_000);
 assert.equal(merchantSourceMaxBytes(curated,hooga.productPage),2_000_000);
 assert.equal(merchantSourceMaxBytes(curated,'https://hoogahealth.com/pages/other'),350_000);
 assert.equal(merchantSourceMaxBytes(curated,'https://hoogahealth.com.evil.example/pages/about'),350_000);
 assert.equal(merchantSourceMaxBytes(curated,'http://hoogahealth.com/pages/about'),350_000);
 assert.equal(merchantSourceMaxBytes(curated,'https://some-merchant.example/products'),350_000);
 assert.equal(merchantSourceMaxBytes(undefined,hooga.officePage),350_000);
});
