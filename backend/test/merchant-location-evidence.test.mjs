import test from 'node:test';
import assert from 'node:assert/strict';
import {firstPartyMerchantLocation,merchantProductPage,sameMerchantHost,merchantSourceMaxBytes} from '../merchant-location-evidence.js';
import {supportedUSCatalogRecord,productTextMatches,observedCommerceControl} from '../product-evidence.js';

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


test('Sun Home candidate requires observed US headquarters, official product pages and live checkout',()=>{
 // Fixtures mirror public claims; the server still fetches and verifies the
 // current official pages rather than trusting this seed as a business lead.
 const sunHome={
  website:'https://sunhomesaunas.com/',
  officePage:'https://sunhomesaunas.com/pages/about',
  officePhrase:'Headquarters San Diego California',
  officeLocation:'San Diego, CA, USA'
 };
 assert.equal(firstPartyMerchantLocation(sunHome,'<h2>Our offices around the world</h2>'),null);
 const official='<section><h2>Headquarters</h2><p>San Diego, California</p></section>';
 const location=firstPartyMerchantLocation(sunHome,official);
 assert.ok(location);
 assert.equal(location.usEvidenceSource,sunHome.officePage);
 assert.equal(supportedUSCatalogRecord({...location,element:{tags:{website:sunHome.website}}}),true);
 const red='https://sunhomesaunas.com/products/300w-pro-red-light';
 const blanket='https://sunhomesaunas.com/products/best-infrared-sauna-blanket-2025';
 const record={
  element:{tags:{website:sunHome.website}},
  productEvidencePages:{'Red light therapy devices':red,'Sauna blankets':blanket}
 };
 assert.equal(merchantProductPage(record,'Red light therapy devices'),red);
 assert.equal(merchantProductPage(record,'Sauna blankets'),blanket);
 assert.equal(productTextMatches('<h2>Medical-Grade Desktop Red Light Therapy Panel</h2>','red light therapy'),true);
 assert.equal(productTextMatches('<h2>Infrared Sauna Blanket</h2>','sauna blankets'),true);
 assert.equal(observedCommerceControl('<button type="submit">Add to Cart</button>'),'Add to Cart');
 assert.equal(merchantProductPage({...record,productEvidencePages:{'Sauna blankets':'https://external.example/product'}},'Sauna blankets'),sunHome.website);
});


test('Lifepro candidate requires its exact official U.S. office statement and distinct product evidence',()=>{
 const merchant={
  website:'https://lifeprofitness.com/',
  officePage:'https://lifeprofitness.com/pages/contact-us',
  officePhrase:'Lifepro Fitness LLC 465 Industrial Way W Eatontown NJ 07724',
  officeLocation:'Eatontown, NJ, USA'
 };
 const official='<main><h2>Company Contact</h2>'+
  '<p>Lifepro Fitness LLC 465 Industrial Way W Eatontown, NJ 07724</p></main>';
 assert.equal(firstPartyMerchantLocation(merchant,'<p>We ship to U.S. homes</p>'),null);
 assert.equal(firstPartyMerchantLocation(merchant,
  '<template><p>Lifepro Fitness LLC 465 Industrial Way W Eatontown NJ 07724</p></template>'),null);
 const evidence=firstPartyMerchantLocation(merchant,official);
 assert.ok(evidence);
 assert.equal(evidence.usEvidenceSource,merchant.officePage);
 assert.equal(supportedUSCatalogRecord({...evidence,element:{tags:{website:merchant.website}}}),true);
 const red='https://lifeprofitness.com/products/bioheal-plus-red-light-therapy-panel';
 const sauna='https://lifeprofitness.com/products/rejuvawrap';
 const row={element:{tags:{website:merchant.website}},productEvidencePages:{
  'Red light therapy devices':red,'Sauna blankets':sauna
 }};
 assert.equal(merchantProductPage(row,'Red light therapy devices'),red);
 assert.equal(merchantProductPage(row,'Sauna blankets'),sauna);
 assert.equal(productTextMatches('<h1>BioHeal Plus Red Light Therapy Panel</h1>','red light therapy'),true);
 assert.equal(productTextMatches('<h1>RejuvaWrap Infrared Sauna Blanket</h1>','sauna blankets'),true);
 assert.equal(merchantSourceMaxBytes([{...merchant,productPage:red}],red),2_000_000);
 assert.equal(observedCommerceControl('<button>Add to cart</button>'),'Add to Cart');
 assert.equal(observedCommerceControl('<button disabled>Add to cart</button>'),undefined);
});


test('American Wellness Authority source candidate needs observed New Jersey office and two official checkout-capable products',()=>{
 const merchant={website:'https://awarlt.com/',
  officePage:'https://awarlt.com/pages/contact-us',
  officePhrase:'1301 W Park Ave Suite F Ocean NJ 07712',
  officeLocation:'Ocean, NJ, USA'};
 assert.equal(firstPartyMerchantLocation(merchant,'<p>Free U.S. shipping on all orders</p>'),null);
 assert.equal(firstPartyMerchantLocation(merchant,
  '<div hidden>1301 W Park Ave Suite F Ocean NJ 07712</div>'),null);
 const source='<main><h2>Who We Are</h2><p>American Wellness Authority</p>'+
  '<p>1301 W. Park Ave, Suite F<br>Ocean, NJ 07712</p></main>';
 const evidence=firstPartyMerchantLocation(merchant,source);
 assert.ok(evidence,'Visible and exact official U.S. company address must qualify as first-party location proof');
 assert.equal(evidence.usEvidenceKind,'first_party_location_statement');
 assert.equal(evidence.usEvidenceSource,merchant.officePage);
 assert.ok(supportedUSCatalogRecord({...evidence,element:{tags:{website:merchant.website}}}));
 const red='https://awarlt.com/products/fx500-red-light-therapy-panel';
 const sauna='https://awarlt.com/products/hl500-infrared-sauna-blanket';
 const record={element:{tags:{website:merchant.website}},productEvidencePages:{
  'Red light therapy devices':red,'Sauna blankets':sauna
 }};
 assert.equal(merchantProductPage(record,'Red light therapy devices'),red);
 assert.equal(merchantProductPage(record,'Sauna blankets'),sauna);
 assert.equal(merchantProductPage(record,'Skin-care devices'),merchant.website);
 assert.equal(productTextMatches('<h1>FX500 Red Light Therapy Panel</h1>','red light therapy'),true);
 assert.equal(productTextMatches('<h1>HL500 Infrared Sauna Blanket</h1>','sauna blankets'),true);
 assert.equal(observedCommerceControl('<button type="submit">+ Add to cart</button>'),'Add to Cart');
 assert.equal(observedCommerceControl('<button disabled>+ Add to cart</button>'),undefined);
 assert.equal(merchantSourceMaxBytes([{...merchant,productPage:red}],red),2_000_000);
 assert.equal(sameMerchantHost(merchant.website,'https://awarlt.com.evil.example/fx500'),false);
});
